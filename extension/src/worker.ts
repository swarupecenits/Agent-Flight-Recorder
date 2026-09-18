import { z } from 'zod';
import { EncryptedVault } from '../../lens/vault.ts';
import { importRecording } from '../../lens/adapters.ts';
import { createExample } from '../../lens/examples.ts';
import { assess, compareEvidence } from '../../lens/engine.ts';
import { executeMockRecovery, planRecovery } from '../../lens/recovery.ts';
import { requestSchema, type WorkerState } from './protocol.ts';
import type { RecoveryPlan } from '../../lens/types.ts';

let vault: EncryptedVault | null = null;
let selectedId: string | null = null;
let comparison: WorkerState['comparison'] = null;
let plan: RecoveryPlan | null = null;
const executed = new Map<string, string>();
function requireVault() { if (!vault) throw new Error('The encrypted recorder worker has not been initialized.'); return vault; }
async function state(): Promise<WorkerState> {
  const storage = requireVault();
  const recordings = await storage.list();
  selectedId ??= recordings[0]?.id ?? null;
  const selected = selectedId ? await storage.read(selectedId) : null;
  return { recordings, selected, assessment: selected ? assess(selected.recording) : null, comparison, plan };
}
async function handle(method: string, payload: unknown) {
  if (method === 'initialize') {
    if (vault) throw new Error('The recorder worker is already initialized.');
    const input = z.object({ directory: z.string().min(1), keyBase64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/) }).strict().parse(payload);
    const key = Buffer.from(input.keyBase64, 'base64');
    vault = new EncryptedVault(input.directory, key);
    key.fill(0);
    await vault.initialize();
    return state();
  }
  const storage = requireVault();
  switch (method) {
    case 'state': return state();
    case 'import': {
      const input = z.object({ recording: z.unknown(), captureContent: z.boolean(), consent: z.literal(true) }).strict().parse(payload);
      const recording = importRecording(input.recording, input.captureContent);
      await storage.save(recording);
      selectedId = recording.run.id; plan = null; comparison = null;
      return state();
    }
    case 'example': {
      const input = z.object({ scenarioId: z.enum(['stale', 'contradiction', 'scope', 'denied', 'corrected']), consent: z.literal(true) }).strict().parse(payload);
      const recording = createExample(input.scenarioId);
      await storage.save(recording); selectedId = recording.run.id; plan = null; comparison = null;
      return state();
    }
    case 'select': {
      const { id } = z.object({ id: z.uuid() }).strict().parse(payload);
      await storage.read(id); selectedId = id; comparison = null; plan = null;
      return state();
    }
    case 'compare': {
      const { id } = z.object({ id: z.uuid() }).strict().parse(payload);
      if (!selectedId) throw new Error('Select a recording before comparing.');
      const current = (await storage.read(selectedId)).recording, other = (await storage.read(id)).recording;
      comparison = current.run.parentRunId === other.run.id ? compareEvidence(other, current) : compareEvidence(current, other);
      return state();
    }
    case 'artifact': {
      const input = z.object({ kind: z.enum(['correction', 'handoff', 'model-draft', 'instruction-proposal', 'review']), title: z.string().max(240), text: z.string().max(32000), consent: z.literal(true) }).strict().parse(payload);
      if (!selectedId) throw new Error('Select a recording before saving a review.');
      await storage.addArtifact(selectedId, input.kind, input.title, input.text);
      return state();
    }
    case 'plan': {
      const input = z.object({ findingId: z.string().max(180), checkpointId: z.string().max(160).nullable(), fresh: z.boolean() }).strict().parse(payload);
      if (!selectedId) throw new Error('Select a recording before planning recovery.');
      plan = planRecovery((await storage.read(selectedId)).recording, input.findingId, input.checkpointId, input.fresh);
      return state();
    }
    case 'execute': {
      const input = z.object({ planId: z.uuid(), approved: z.literal(true), consent: z.literal(true) }).strict().parse(payload);
      if (executed.has(input.planId)) {
        selectedId = executed.get(input.planId)!;
        return state();
      }
      if (!plan || plan.id !== input.planId) throw new Error('Review the exact current recovery plan before approval.');
      const original = (await storage.read(plan.runId)).recording;
      const corrected = executeMockRecovery(original, plan, input.planId);
      await storage.save(corrected);
      executed.set(input.planId, corrected.run.id);
      selectedId = corrected.run.id; comparison = compareEvidence(original, corrected); plan = null;
      return state();
    }
    case 'expired': {
      const { days } = z.object({ days: z.number().int().min(1).max(365) }).strict().parse(payload);
      return storage.expired(days);
    }
    case 'purge': {
      const input = z.object({ days: z.number().int().min(1).max(365), ids: z.array(z.uuid()).max(200), approved: z.literal(true) }).strict().parse(payload);
      const expired = await storage.expired(input.days);
      if (input.ids.some(id => !expired.includes(id))) throw new Error('The approved expiration list changed. Review it again.');
      await storage.purge(input.ids, input.ids);
      if (selectedId && input.ids.includes(selectedId)) selectedId = null;
      plan = null; comparison = null;
      return state();
    }
    case 'dispose': storage.dispose(); vault = null; return { closed: true };
    default: throw new Error('Unsupported recorder worker operation.');
  }
}
let queue = Promise.resolve();
process.on('message', message => {
  queue = queue.then(async () => {
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) { process.stderr.write('Rejected malformed worker IPC request.\n'); return; }
    const { id, method, payload } = parsed.data;
    try { process.send?.({ id, ok: true, data: await handle(method, payload) }); }
    catch (error) {
      const detail = error instanceof z.ZodError ? 'The worker request does not match its versioned schema.'
        : error instanceof Error ? error.message : 'The recorder worker failed.';
      process.send?.({ id, ok: false, error: detail.slice(0, 2000) });
    }
  }).catch(error => {
    process.stderr.write(`Recorder queue failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = 1;
  });
});
process.on('disconnect', () => { vault?.dispose(); process.exit(0); });
