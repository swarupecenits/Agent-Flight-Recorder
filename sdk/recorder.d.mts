export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type EventType = 'prompt' | 'decision' | 'tool.started' | 'tool.completed' | 'tool.failed' |
  'model.started' | 'model.completed' | 'model.failed' | 'retry' | 'policy.evaluated' |
  'approval.requested' | 'approval.resolved' | 'output';
export type TerminalStatus = 'completed' | 'failed' | 'blocked' | 'interrupted';
export interface RecordedError { name: string; message: string; code?: string }
export interface RunDefinition {
  name: string;
  agentName: string;
  input?: JsonValue;
  metadata?: Record<string, JsonValue>;
}
export interface Credentials { runId: string; traceId: string; writeToken: string }
export interface EventFields {
  id?: string;
  timestamp?: string;
  spanId?: string | null;
  parentSpanId?: string | null;
  input?: JsonValue;
  output?: JsonValue;
  error?: RecordedError | null;
  attributes?: Record<string, JsonValue>;
  stateDelta?: Record<string, JsonValue>;
  durationMs?: number | null;
  redactedPaths?: string[];
}
export interface CapturedEvent extends EventFields {
  id: string;
  type: string;
  name: string;
  runId: string;
  traceId: string;
  seq: number;
  timestamp: string;
  recordedAt: string;
  previousHash: string;
  hash: string;
}
export interface CapturedRun {
  id: string;
  traceId: string;
  name: string;
  agentName: string;
  status: TerminalStatus | 'running' | 'awaiting_approval';
  origin: 'sdk' | 'demo' | 'import';
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
  rootHash: string;
  readOnly: boolean;
}
export interface FinishInput { status?: TerminalStatus; output?: JsonValue; error?: RecordedError }
export interface Usage { inputTokens: number; outputTokens: number }
export interface OperationOptions<T> {
  attempts?: number;
  retryDelayMs?: number;
  retryIf?: (error: unknown) => boolean;
  attributes?: Record<string, JsonValue>;
  getUsage?: (result: T) => Usage | undefined;
}
export interface RunRecorder {
  readonly id: string;
  readonly traceId: string;
  readonly writeToken: string;
  readonly closed: boolean;
  event(type: EventType, name: string, fields?: EventFields): Promise<CapturedEvent>;
  prompt(input: JsonValue): Promise<CapturedEvent>;
  decision(note: string, stateDelta?: Record<string, JsonValue>): Promise<CapturedEvent>;
  policy(tool: string, result: Record<string, JsonValue>, input?: JsonValue): Promise<CapturedEvent>;
  output(value: JsonValue): Promise<CapturedEvent>;
  tool<T>(name: string, input: JsonValue, callback: () => T | Promise<T>, options?: OperationOptions<T>): Promise<T>;
  model<T>(name: string, input: JsonValue, callback: () => T | Promise<T>, options?: OperationOptions<T>): Promise<T>;
  finish(result?: FinishInput): Promise<CapturedRun>;
}
export interface CaptureTransport {
  createRun(input: RunDefinition): Credentials | Promise<Credentials>;
  append(runId: string, writeToken: string, event: EventFields & { type: string; name: string }): CapturedEvent | Promise<CapturedEvent>;
  finish(runId: string, writeToken: string, result: FinishInput): CapturedRun | Promise<CapturedRun>;
}
export class RecordingError extends Error { code: string; constructor(message: string, code?: string) }
export function describeError(error: unknown): RecordedError;
export class FlightRecorder {
  constructor(options?: { baseUrl?: string; transport?: CaptureTransport });
  startRun(input: RunDefinition): Promise<RunRecorder>;
  resume(credentials: Credentials): RunRecorder;
  run<T>(input: RunDefinition, callback: (run: RunRecorder) => T | Promise<T>): Promise<T>;
}
