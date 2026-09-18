import { assess } from './engine.ts';
import type { LensRecording } from './types.ts';

export function modelContext(recording: LensRecording): string {
  const assessment = assess(recording);
  const linked = new Set(assessment.findings.slice(0, 12).flatMap(item => item.evidenceIds));
  const context = JSON.stringify({
    purpose: 'Advisory handoff only; deterministic verdicts cannot be changed by model prose.',
    synthetic: recording.run.synthetic, adapter: recording.adapter, finalScope: recording.finalScope,
    findings: assessment.findings.slice(0, 12), gaps: assessment.gaps.slice(0, 12),
    evidence: recording.events.filter(event => linked.has(event.id)).map(event => ({
      id: event.id, seq: event.seq, scope: event.scope,
      observation: event.observation ? { ...event.observation, excerpt: undefined } : null,
    })),
  });
  if (Buffer.byteLength(context) > 24000) throw new Error('The selected evidence exceeds the 24,000-byte external-review limit.');
  return context;
}
