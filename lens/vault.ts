import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { assess } from './engine.ts';
import { canonical, validateRecording } from './schema.ts';
import type { LensArtifact, LensRecording, RecordingListItem, StoredRecording } from './types.ts';

const uuid = z.uuid();
const envelopeSchema = z.object({
  format: z.literal('evidence-lens-encrypted'), version: z.literal(1), id: z.uuid(),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/), tag: z.string().regex(/^[A-Za-z0-9+/]{22}==$/), ciphertext: z.string().min(4),
}).strict();
const storedSchema = z.object({
  recording: z.unknown(), savedAt: z.iso.datetime({ offset: true }),
  artifacts: z.array(z.object({
    id: z.uuid(), kind: z.enum(['correction', 'handoff', 'model-draft', 'instruction-proposal', 'review']),
    title: z.string().max(240), text: z.string().max(32000), createdAt: z.iso.datetime({ offset: true }),
  }).strict()).max(100),
}).strict();
export class EncryptedVault {
  private key: Buffer;
  constructor(privateDirectory: string, key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error('A 256-bit vault key from SecretStorage is required.');
    this.directory = privateDirectory;
    this.key = Buffer.from(key);
  }
  readonly directory: string;
  private path(id: string) { return join(this.directory, `${uuid.parse(id)}.lens.enc`); }
  async initialize() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); }
  private encrypt(id: string, value: StoredRecording): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`evidence-lens:v1:${id}`));
    const ciphertext = Buffer.concat([cipher.update(canonical(value), 'utf8'), cipher.final()]);
    return JSON.stringify({ format: 'evidence-lens-encrypted', version: 1, id, iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
  }
  async read(id: string): Promise<StoredRecording> {
    const bytes = await readFile(this.path(id));
    if (bytes.byteLength > 12 * 1024 * 1024) throw new Error('The encrypted recording exceeds its size limit.');
    let input: unknown;
    try { input = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The encrypted recording envelope is malformed.'); }
    const parsedEnvelope = envelopeSchema.safeParse(input);
    if (!parsedEnvelope.success) throw new Error('The encrypted recording envelope is invalid or has a truncated authentication tag.');
    const envelope = parsedEnvelope.data;
    if (envelope.id !== id) throw new Error('The encrypted record identity is inconsistent.');
    let decrypted: unknown;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'), { authTagLength: 16 });
      decipher.setAAD(Buffer.from(`evidence-lens:v1:${id}`));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      decrypted = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    } catch { throw new Error('Decryption or authentication failed. The key is unavailable/wrong or the recording was modified; no plaintext fallback is allowed.'); }
    const parsed = storedSchema.safeParse(decrypted);
    if (!parsed.success) throw new Error('Encrypted record or review-artifact structure is invalid.');
    const value: StoredRecording = { ...parsed.data, recording: validateRecording(parsed.data.recording) };
    if (value.recording.run.id !== id) throw new Error('Encrypted record contents are inconsistent.');
    return value;
  }
  private async write(value: StoredRecording) {
    storedSchema.parse(value);
    const encrypted = this.encrypt(value.recording.run.id, value);
    if (Buffer.byteLength(encrypted) > 12 * 1024 * 1024) throw new Error('Encrypted record and artifacts exceed the size limit.');
    const target = this.path(value.recording.run.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      try { await unlink(temporary); } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Vault write and cleanup failed.');
      }
      throw error;
    }
  }
  async ids(): Promise<string[]> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && /^[a-f0-9-]{36}\.lens\.enc$/.test(entry.name)).map(entry => entry.name.slice(0, -9));
  }
  async save(recording: LensRecording): Promise<{ duplicate: boolean; id: string }> {
    validateRecording(recording);
    const ids = await this.ids();
    if (ids.includes(recording.run.id)) {
      const existing = await this.read(recording.run.id);
      if (existing.recording.integrity.digest !== recording.integrity.digest) throw new Error('A different immutable recording already has this ID. It was not overwritten.');
      return { duplicate: true, id: recording.run.id };
    }
    if (ids.length >= 200) throw new Error('The encrypted vault supports 200 recordings. Review retention and explicitly remove expired records.');
    await this.write({ recording, artifacts: [], savedAt: new Date().toISOString() });
    return { duplicate: false, id: recording.run.id };
  }
  async list(): Promise<RecordingListItem[]> {
    const result: RecordingListItem[] = [];
    for (const id of await this.ids()) {
      const { recording } = await this.read(id);
      const analysis = assess(recording);
      result.push({ id, name: recording.run.name, startedAt: recording.run.startedAt, status: recording.run.status,
        claims: analysis.findings.length, unresolved: analysis.findings.length - analysis.counts.Supported, synthetic: recording.run.synthetic });
    }
    return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async addArtifact(id: string, kind: LensArtifact['kind'], title: string, text: string): Promise<LensArtifact> {
    const value = await this.read(id);
    if (text.length > 32000 || title.length > 240 || value.artifacts.length >= 100) throw new Error('Artifact size/count limit reached.');
    const artifact: LensArtifact = { id: randomUUID(), kind, title, text, createdAt: new Date().toISOString() };
    value.artifacts.push(artifact);
    await this.write(value);
    return artifact;
  }
  async expired(retentionDays: number, now = Date.now()): Promise<string[]> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('Retention must be between 1 and 365 days.');
    const expired: string[] = [];
    for (const id of await this.ids()) if (Date.parse((await this.read(id)).savedAt) < now - retentionDays * 86_400_000) expired.push(id);
    return expired;
  }
  async purge(ids: string[], approvedIds: string[]) {
    if (canonical(ids) !== canonical(approvedIds)) throw new Error('Approve the exact expired-record list before deletion.');
    for (const id of ids) { await this.read(id); await unlink(this.path(id)); }
  }
  dispose() { this.key.fill(0); }
}
