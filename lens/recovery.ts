import { randomUUID } from 'node:crypto';
import { assess } from './engine.ts';
import { createExample, supportedCheckpoint } from './examples.ts';
import { validateRecording } from './schema.ts';
import type { LensRecording, RecoveryPlan } from './types.ts';

export function planRecovery(recording: LensRecording, findingId: string, checkpointId: string | null, fresh: boolean): RecoveryPlan {
  const finding = assess(recording).findings.find(item => item.id === findingId);
  if (!finding) throw new Error('Choose an existing finding before planning recovery.');
  const checkpoint = checkpointId ? recording.events.find(event => event.id === checkpointId && event.checkpoint) : null;
  const earliestEvidence = Math.min(finding.seq, ...finding.evidenceIds.map(id => recording.events.find(event => event.id === id)?.seq ?? finding.seq));
  const usable = Boolean(checkpoint && checkpoint.seq < earliestEvidence && supportedCheckpoint(checkpoint.checkpoint));
  const synthetic = ['lens-mock', 'foundry-evidence-demo'].includes(recording.adapter.id) && recording.adapter.version === 1 && recording.run.synthetic;
  const executable = synthetic && (fresh || usable);
  const mode = executable ? (fresh ? 'mock-fresh' : 'mock-checkpoint') : 'handoff';
  return {
    id: randomUUID(), runId: recording.run.id, originalDigest: recording.integrity.digest, findingId, mode, executable,
    checkpointId: usable && !fresh ? checkpoint!.id : null,
    restartBoundary: mode === 'mock-checkpoint' ? `Event ${checkpoint!.seq}: ${checkpoint!.checkpoint!.boundary}`
      : mode === 'mock-fresh' ? 'Beginning of a NEW synthetic harness run. This is not exact-point resume.'
        : 'No compatible runtime can be restored. Export the reviewed handoff and start a fresh run in your own runtime.',
    findingSeq: finding.seq, correction: finding.correction,
    effects: executable ? ['Execute the fixed in-memory fixture only.', 'Run fresh local assertions on corrected version B.', 'Create a new encrypted, parent-linked recording.', 'No network, shell, filesystem tool, email, or external write can be called by this harness.']
      : ['Prepare a reviewed handoff only. No tools will execute and no private CLI/Agency capability is assumed.'],
    limits: { maxEvents: 30, timeoutMs: 5000, externalWrites: 0 },
    reason: usable && executable ? 'This checkpoint contains compatible, validated mock state before the relevant action, not just a timeline position.'
      : executable ? 'A new explicitly labeled mock run is supported.'
        : 'Exact-point resume requires compatible runtime state. An imported checkpoint label or event timestamp alone is insufficient.',
    createdAt: new Date().toISOString(),
  };
}
export function executeMockRecovery(recording: LensRecording, plan: RecoveryPlan, approvedPlanId: string): LensRecording {
  validateRecording(recording);
  if (approvedPlanId !== plan.id) throw new Error('This exact recovery plan requires explicit approval.');
  if (plan.runId !== recording.run.id || plan.originalDigest !== recording.integrity.digest) throw new Error('The recording changed after the plan was reviewed.');
  if (!plan.executable || !['mock-fresh', 'mock-checkpoint'].includes(plan.mode)) throw new Error('Unsupported execution capability. Live tool fallback is prohibited.');
  const checkpoint = plan.checkpointId ? recording.events.find(event => event.id === plan.checkpointId)?.checkpoint : undefined;
  if (plan.mode === 'mock-checkpoint' && !supportedCheckpoint(checkpoint)) throw new Error('The approved mock state is no longer compatible.');
  const started = performance.now();
  const result = createExample('corrected', { parentRunId: recording.run.id,
    ...(plan.checkpointId ? { checkpointId: plan.checkpointId, checkpoint } : {}), correction: plan.correction });
  if (result.events.length > plan.limits.maxEvents || performance.now() - started > plan.limits.timeoutMs) throw new Error('The mock recovery exceeded its approved limits.');
  return result;
}
