import { z } from 'zod';
import { EVENT_TYPES } from '../shared/trace.mjs';

const json = z.json();
const map = z.record(z.string().max(200), json);
export const scenarioIds = ['approval', 'retry', 'blocked', 'failure', 'success'];
export const createRunSchema = z.object({
  name: z.string().trim().min(3).max(160),
  agentName: z.string().trim().min(2).max(100),
  input: json.default(null),
  metadata: map.default({}),
  redactedPaths: z.array(z.string().max(500)).max(500).default([]),
}).strict();
export const eventSchema = z.object({
  id: z.uuid().optional(), type: z.enum(EVENT_TYPES), name: z.string().trim().min(1).max(200),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  spanId: z.string().regex(/^[a-f0-9]{16}$/).nullable().default(null),
  parentSpanId: z.string().regex(/^[a-f0-9]{16}$/).nullable().default(null),
  durationMs: z.number().finite().min(0).max(86_400_000).nullable().default(null),
  input: json.default(null), output: json.default(null),
  error: z.object({ name: z.string().max(160), message: z.string().max(4000), code: z.string().max(120).optional() }).strict().nullable().default(null),
  attributes: map.default({}), stateDelta: map.default({}),
  redactedPaths: z.array(z.string().max(500)).max(500).default([]),
}).strict();
export const finishSchema = z.object({
  status: z.enum(['completed', 'failed', 'blocked', 'interrupted']).default('completed'),
  output: json.optional(),
  error: z.object({ name: z.string().max(160), message: z.string().max(4000), code: z.string().max(120).optional() }).strict().optional(),
  redactedPaths: z.array(z.string().max(500)).max(500).default([]),
}).strict();
export const demoSchema = z.object({ scenarioId: z.enum(scenarioIds), name: z.string().trim().min(3).max(160).optional() }).strict();
export const approvalSchema = z.object({
  decision: z.enum(['approve', 'reject']), actor: z.string().trim().min(2).max(100), comment: z.string().trim().max(1000).default(''),
}).strict();
export const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(50) }).strict();
export const storedEventSchema = eventSchema.extend({
  id: z.uuid(), runId: z.uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/),
  seq: z.number().int().min(1), timestamp: z.iso.datetime({ offset: true }),
  recordedAt: z.iso.datetime({ offset: true }),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/), hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const headerSchema = createRunSchema.extend({
  id: z.uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/), startedAt: z.iso.datetime({ offset: true }),
  origin: z.enum(['sdk', 'demo']), parentRunId: z.uuid().nullable(), scenarioId: z.enum(scenarioIds).nullable(),
});
export const recordingSchema = z.object({
  format: z.literal('agent-flight-recorder'), version: z.literal(1), header: headerSchema,
  status: z.enum(['running', 'awaiting_approval', 'completed', 'failed', 'blocked', 'interrupted']),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  rootHash: z.string().regex(/^[a-f0-9]{64}$/),
  events: z.array(storedEventSchema).min(1).max(1000),
}).strict();
export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function validateUsage(event) {
  if (event.type !== 'model.completed' || !Object.hasOwn(event.attributes, 'usage')) return;
  const usage = event.attributes.usage;
  if (!usage || typeof usage !== 'object' || !Number.isInteger(usage.inputTokens) || usage.inputTokens < 0 ||
      !Number.isInteger(usage.outputTokens) || usage.outputTokens < 0) {
    throw new HttpError(422, 'INVALID_USAGE', 'Measured model usage requires non-negative integer inputTokens and outputTokens. Omit usage when it was not measured.');
  }
}
