import { z } from 'zod';
import { redact } from '../sdk/privacy.mjs';
import { verifyChain, TERMINAL_TYPES, TERMINAL_STATUSES } from '../shared/trace.mjs';
import { recordingSchema as nativeSchema } from '../server/schemas.mjs';
import { claimSchema, observationSchema, inventorySchema, scopeSchema, recordingSchema, seal, validateRecording } from './schema.ts';
import type { LensEvent, LensRecording, SourceHealth } from './types.ts';

const annotationSchema = z.object({
  version: z.literal(1), scope: scopeSchema.optional(), contextSnapshot: z.boolean().optional(),
  claim: claimSchema.optional(), observation: observationSchema.optional(), assetIds: z.array(z.string().max(240)).max(100).optional(),
}).strict();
const metadataSchema = z.object({
  version: z.literal(1), finalScope: scopeSchema.optional(), inventory: z.array(inventorySchema).max(300).optional(),
}).strict();
export const adapterHealth: SourceHealth[] = [
  { id: 'lens-json-v1', version: '1', status: 'imported', detail: 'Public versioned Evidence Lens JSON import; integrity and causal links are checked.', capabilities: ['import', 'claims', 'manifest', 'read-only-replay'] },
  { id: 'afr-json-v1', version: '1', status: 'imported', detail: 'Native Agent Flight Recorder export. Structured attributes.lens v1 are optional; missing versions and claims stay unavailable.', capabilities: ['import', 'native-chain-verification'] },
  { id: 'vscode-task', version: '1', status: 'disabled', detail: 'Opt-in public VS Code task capture. Only the explicitly selected task is observed; output and private agent activity are not intercepted.', capabilities: ['task-exit', 'workspace-version'] },
  { id: 'copilot-private-panels', version: null, status: 'unavailable', detail: 'Private Copilot panels and hidden reasoning are not accessible. Existing Chat stays unchanged.', capabilities: [] },
  { id: 'cli-agency-resume', version: null, status: 'unavailable', detail: 'No compatible CLI/Agency checkpoint adapter is installed. Timeline positions cannot restore that runtime.', capabilities: [] },
  { id: 'mcp-backend-internals', version: null, status: 'unavailable', detail: 'Only supplied client-side tool observations can be imported. Opaque server internals are unavailable.', capabilities: [] },
];
export function protectRecording(recording: LensRecording, captureContent: boolean): LensRecording {
  const clone = structuredClone(recording);
  const sourceDigest = clone.integrity.digest;
  if (!captureContent) {
    clone.contentCapture = 'minimized';
    for (const event of clone.events) {
      delete event.content;
      if (event.observation) delete event.observation.excerpt;
      if (event.claim?.quote) delete event.claim.quote;
    }
  }
  const clean: LensRecording = recordingSchema.parse(redact(clone).value);
  if (JSON.stringify(clean) !== JSON.stringify(recording)) {
    clean.provenance.sourceRootHash ??= sourceDigest;
    clean.gaps.push({ code: 'DERIVED_PRIVACY_PROJECTION', detail: 'This is a redacted/minimized derivative. Its digest is not the original source digest; provenance retains that reference.' });
  }
  return validateRecording(seal(clean));
}
export function importRecording(value: unknown, captureContent = false): LensRecording {
  const format = z.object({ format: z.string(), version: z.number() }).passthrough().safeParse(value);
  if (!format.success) throw new Error('Choose a versioned Evidence Lens or Agent Flight Recorder JSON export.');
  if (format.data.format === 'agent-evidence-lens') return protectRecording(validateRecording(value), captureContent);
  const parsed = nativeSchema.safeParse(value);
  if (!parsed.success) throw new Error('Unsupported or malformed adapter format. Only Evidence Lens v1 and native Agent Flight Recorder v1 are supported.');
  const native = parsed.data;
  if (!verifyChain(native.header, native.events, native.rootHash).valid) throw new Error('Native recording chain is inconsistent or modified.');
  const last = native.events.at(-1)!;
  if (native.events[0].type !== 'run.started' || native.events.slice(1).some(event => event.type === 'run.started') ||
      native.events.slice(0, -1).some(event => TERMINAL_TYPES.has(event.type)) ||
      (TERMINAL_TYPES.has(last.type) ? native.status !== last.type.slice(4) || native.endedAt !== last.recordedAt
        : TERMINAL_STATUSES.has(native.status) || native.endedAt !== null)) throw new Error('Native recording lifecycle and terminal event disagree.');
  const metadataResult = native.header.metadata.evidenceLens === undefined ? null : metadataSchema.safeParse(native.header.metadata.evidenceLens);
  if (metadataResult && !metadataResult.success) throw new Error('Native evidenceLens metadata is not compatible with annotation version 1.');
  const metadata = metadataResult?.data;
  const recording: LensRecording = {
    format: 'agent-evidence-lens', version: 1,
    run: { id: native.header.id, name: native.header.name, agent: native.header.agentName, startedAt: native.header.startedAt,
      endedAt: native.endedAt, status: native.status,
      parentRunId: native.header.parentRunId, synthetic: native.header.origin === 'demo' || native.header.metadata.fictionalData === true },
    adapter: { id: 'afr-json-v1', version: 1, mode: 'import' }, contentCapture: 'included',
    finalScope: metadata?.finalScope ?? {}, inventory: metadata?.inventory ?? [],
    sources: [adapterHealth[1]], gaps: [{ code: 'IMPORT_BOUNDARY', detail: 'Imported observations only. No private agent conversation, backend internals, or restorable runtime state is implied.' }],
    events: [], provenance: { sourceRunId: native.header.id, sourceRootHash: native.rootHash, restartedFrom: null },
    integrity: { algorithm: 'sha256', digest: '0'.repeat(64) },
  };
  for (const source of native.events) {
    const result = source.attributes.lens === undefined ? null : annotationSchema.safeParse(source.attributes.lens);
    if (result && !result.success) throw new Error(`Native event ${source.seq} has invalid attributes.lens v1 annotations.`);
    const annotation = result?.data;
    let type: LensEvent['type'] = 'note';
    if (source.type === 'run.started') type = 'run.started';
    else if (source.type.startsWith('run.')) type = 'run.finished';
    else if (source.type === 'tool.started' || source.type === 'model.started') type = 'tool.started';
    else if (annotation?.claim) type = 'claim';
    else if (annotation?.observation) type = 'tool.result';
    else if (annotation?.contextSnapshot) type = 'context.snapshot';
    if (annotation?.contextSnapshot && annotation.scope) recording.finalScope = { ...recording.finalScope, ...annotation.scope };
    const spanParent = source.parentSpanId ? native.events.find(parent => parent.spanId === source.parentSpanId && parent.seq < source.seq) : undefined;
    recording.events.push({
      id: source.id, seq: source.seq, timestamp: source.timestamp, name: source.name.slice(0, 240), type,
      parents: spanParent ? [spanParent.id] : [], scope: annotation?.scope ?? {}, assetIds: annotation?.assetIds ?? [],
      sourceEventId: source.id, sourceSeq: source.seq,
      ...(annotation?.claim ? { claim: annotation.claim } : {}),
      ...(annotation?.observation ? { observation: annotation.observation } : {}),
      ...(captureContent ? { content: { input: source.input ?? null, output: source.output ?? null } } : {}),
    });
  }
  if (!metadata) recording.gaps.push({ code: 'NATIVE_MANIFEST_UNAVAILABLE', detail: 'No explicit versioned inventory was supplied. Available skills, instructions, repositories, and resources cannot be reconstructed from tool names.' });
  const declaredAgent = recording.inventory.find(item => item.id === native.header.agentName && item.kind === 'agent');
  if (declaredAgent) declaredAgent.usedBy = [...new Set([...declaredAgent.usedBy, recording.events[0].id])];
  else recording.inventory.push({ kind: 'agent', id: native.header.agentName, name: native.header.agentName, version: null, available: true, usedBy: [recording.events[0].id] });
  return protectRecording(seal(recording), captureContent);
}
