import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { LensRecording, LensEvent } from './types.ts';
export { defaultSettings } from './catalog.ts';

const text = z.string().max(2000);
const id = z.string().regex(/^[a-zA-Z0-9._:-]{1,160}$/);
export const scopeSchema = z.object({
  repositoryId: text.optional(), codeVersion: text.optional(), resourceId: text.optional(),
  environment: text.optional(), queryScope: text.optional(), suite: text.optional(),
}).strict();
export const observationSchema = z.object({
  kind: z.enum(['test', 'action', 'health', 'citation']),
  outcome: z.enum(['passed', 'failed', 'succeeded', 'healthy', 'unhealthy', 'denied', 'unknown']),
  exitCode: z.number().int().nullable().optional(),
  passed: z.number().int().min(0).optional(), failed: z.number().int().min(0).optional(),
  sourceId: text.optional(), sourceVersion: text.optional(), excerpt: z.string().max(16000).optional(),
  excerptHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export const claimSchema = z.object({
  kind: z.enum(['test', 'action', 'health', 'citation']), text,
  evidenceIds: z.array(id).max(50), appliesTo: z.enum(['final', 'captured']),
  quote: z.string().max(4000).optional(),
}).strict();
export const checkpointSchema = z.object({
  harness: id, version: z.number().int().min(1), boundary: text,
  state: z.object({ fixture: id, revision: id, environment: text }).strict(),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const eventSchema = z.object({
  id, seq: z.number().int().min(1), timestamp: z.iso.datetime({ offset: true }),
  type: z.enum(['run.started', 'run.finished', 'context.snapshot', 'tool.started', 'tool.result', 'claim', 'inventory', 'checkpoint', 'capture.gap', 'note']),
  name: z.string().max(240), parents: z.array(id).max(50), scope: scopeSchema,
  observation: observationSchema.optional(), claim: claimSchema.optional(), checkpoint: checkpointSchema.optional(),
  assetIds: z.array(z.string().max(240)).max(100),
  content: z.object({ input: z.json().optional(), output: z.json().optional() }).strict().optional(),
  model: z.object({
    deployment: z.string().max(160), model: z.string().max(160), responseId: z.string().max(240),
    durationMs: z.number().finite().min(0), streamedDeltas: z.number().int().min(0),
    usage: z.object({ inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0), totalTokens: z.number().int().min(0) }).strict().nullable(),
  }).strict().optional(),
  sourceEventId: id.optional(), sourceSeq: z.number().int().min(1).optional(),
}).strict();
export const inventorySchema = z.object({
  kind: z.enum(['agent', 'skill', 'instruction', 'mcp-server', 'mcp-tool', 'tool', 'resource', 'repository']),
  id: z.string().min(1).max(240), name: z.string().min(1).max(240),
  version: z.string().max(2000).nullable(), available: z.boolean(), usedBy: z.array(id).max(1000),
}).strict();
export const recordingSchema = z.object({
  format: z.literal('agent-evidence-lens'), version: z.literal(1),
  run: z.object({
    id: z.uuid(), name: z.string().min(1).max(240), agent: z.string().min(1).max(160),
    startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(['running', 'awaiting_approval', 'completed', 'failed', 'blocked', 'interrupted']),
    parentRunId: z.uuid().nullable(), synthetic: z.boolean(),
  }).strict(),
  adapter: z.object({ id, version: z.number().int().min(1), mode: z.enum(['import', 'live', 'mock']) }).strict(),
  contentCapture: z.enum(['minimized', 'included']),
  finalScope: scopeSchema,
  inventory: z.array(inventorySchema).max(300),
  sources: z.array(z.object({
    id, version: z.string().max(100).nullable(),
    status: z.enum(['imported', 'capturing', 'disabled', 'unavailable', 'partial']),
    detail: text, capabilities: z.array(z.string().max(100)).max(30),
  }).strict()).max(30),
  gaps: z.array(z.object({ code: id, detail: text, eventId: id.optional() }).strict()).max(300),
  events: z.array(eventSchema).min(1).max(1000),
  provenance: z.object({
    sourceRunId: z.string().max(160).nullable(), sourceRootHash: z.string().max(160).nullable(),
    restartedFrom: id.nullable(),
  }).strict(),
  integrity: z.object({ algorithm: z.literal('sha256'), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
}).strict();
export const settingsSchema = z.object({
  consent: z.boolean(), captureContent: z.boolean(), liveCapture: z.boolean(),
  externalAnalysis: z.boolean(), retentionDays: z.number().int().min(1).max(365),
}).strict();
export function canonical(value: unknown): string {
  if (value === undefined) throw new Error('Evidence data cannot contain undefined.');
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}
export function seal(recording: Omit<LensRecording, 'integrity'> | LensRecording): LensRecording {
  const { integrity: _, ...body } = { integrity: undefined, ...recording };
  return { ...body, integrity: { algorithm: 'sha256', digest: hash(body) } };
}
export function validateRecording(value: unknown): LensRecording {
  const parsed = recordingSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid Evidence Lens v1 recording at ${issue.path.join('.') || 'root'}: ${issue.code}.`);
  }
  const recording = parsed.data as LensRecording;
  if (Buffer.byteLength(canonical(recording)) > 6 * 1024 * 1024) throw new Error('Recording exceeds the 6 MiB limit.');
  if (seal(recording).integrity.digest !== recording.integrity.digest) throw new Error('Recording integrity mismatch. The imported evidence was modified.');
  const seen = new Set<string>();
  for (const [index, event] of recording.events.entries()) {
    if (event.seq !== index + 1 || seen.has(event.id)) throw new Error('Recording event IDs or sequence are inconsistent.');
    if (event.parents.some(parent => !seen.has(parent))) throw new Error('Causal parents must refer to earlier captured events.');
    if (event.type === 'claim' && !event.claim) throw new Error('A claim event must include its structured claim.');
    if (event.type === 'checkpoint' && !event.checkpoint) throw new Error('A checkpoint event must include its captured runtime state.');
    seen.add(event.id);
  }
  return recording;
}
export function newRecording(name: string, agent: string, mode: 'import' | 'live' | 'mock'): LensRecording {
  return seal({
    format: 'agent-evidence-lens', version: 1,
    run: { id: randomUUID(), name, agent, startedAt: new Date().toISOString(), endedAt: null,
      status: 'running', parentRunId: null, synthetic: mode === 'mock' },
    adapter: { id: mode === 'mock' ? 'lens-mock' : 'vscode-task', version: 1, mode },
    contentCapture: 'minimized', finalScope: {}, inventory: [], sources: [], gaps: [], events: [],
    provenance: { sourceRunId: null, sourceRootHash: null, restartedFrom: null },
  });
}
export function addEvent(recording: LensRecording, input: Omit<LensEvent, 'id' | 'seq' | 'timestamp' | 'parents' | 'assetIds' | 'scope'> & Partial<Pick<LensEvent, 'id' | 'timestamp' | 'parents' | 'assetIds' | 'scope'>>): LensEvent {
  const event: LensEvent = { id: randomUUID(), seq: recording.events.length + 1,
    timestamp: new Date().toISOString(), parents: [], assetIds: [], scope: {}, ...input };
  recording.events.push(event);
  return event;
}
