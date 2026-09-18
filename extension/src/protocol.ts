import { z } from 'zod';
import { settingsSchema } from '../../lens/schema.ts';
import type { Assessment, LensComparison, RecoveryPlan, RecordingListItem, StoredRecording } from '../../lens/types.ts';
export interface WorkerState {
  recordings: RecordingListItem[];
  selected: StoredRecording | null;
  assessment: Assessment | null;
  comparison: LensComparison | null;
  plan: RecoveryPlan | null;
}
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['ready', 'import', 'privacy', 'captureValidation', 'importCollector', 'existingChat', 'purge', 'modelReview', 'instructionProposal']) }).strict(),
  z.object({ type: z.enum(['example', 'liveDemo']), scenarioId: z.enum(['stale', 'contradiction', 'scope', 'denied', 'corrected']) }).strict(),
  z.object({ type: z.enum(['select', 'compare']), runId: z.uuid() }).strict(),
  z.object({ type: z.literal('draftCorrection'), findingId: z.string().max(180) }).strict(),
  z.object({ type: z.literal('updatePrivacy'), settings: settingsSchema }).strict(),
  z.object({ type: z.literal('export'), format: z.enum(['json', 'markdown']) }).strict(),
  z.object({ type: z.literal('planRecovery'), findingId: z.string().max(180), checkpointId: z.string().max(160).nullable(), fresh: z.boolean() }).strict(),
  z.object({ type: z.literal('executeRecovery'), planId: z.uuid() }).strict(),
  z.object({ type: z.literal('reviewFinding'), findingId: z.string().max(180), decision: z.enum(['acknowledged', 'dismissed']) }).strict(),
]);
export const requestSchema = z.object({ id: z.uuid(), method: z.enum(['initialize', 'state', 'import', 'example', 'select', 'compare', 'artifact', 'plan', 'execute', 'expired', 'purge', 'dispose']), payload: z.unknown() }).strict();
export const responseSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.uuid(), ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ id: z.uuid(), ok: z.literal(false), error: z.string().max(2000) }).strict(),
]);
