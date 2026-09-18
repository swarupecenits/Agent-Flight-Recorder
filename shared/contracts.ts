export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RunStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'blocked' | 'interrupted';
export type ScenarioId = 'approval' | 'retry' | 'blocked' | 'failure' | 'success';
export type EventType = 'run.started' | 'prompt' | 'decision' | 'tool.started' | 'tool.completed' | 'tool.failed' | 'model.started' | 'model.completed' | 'model.failed' | 'retry' | 'policy.evaluated' | 'approval.requested' | 'approval.resolved' | 'output' | 'run.completed' | 'run.failed' | 'run.blocked' | 'run.interrupted';

export interface Metrics {
  durationMs: number; toolCalls: number; errors: number; retries: number;
  blocked: number; approvals: number; inputTokens: number | null; outputTokens: number | null;
}
export interface Run {
  id: string; traceId: string; name: string; agentName: string;
  origin: 'demo' | 'sdk' | 'import'; status: RunStatus; startedAt: string;
  endedAt: string | null; eventCount: number; rootHash: string;
  parentRunId: string | null; scenarioId: ScenarioId | null;
  input: Json; metadata: Record<string, Json>; metrics: Metrics; readOnly: boolean;
}
export interface TraceEvent {
  id: string; runId: string; traceId: string; seq: number; type: EventType;
  name: string; timestamp: string; recordedAt: string; spanId: string | null;
  parentSpanId: string | null; durationMs: number | null; input: Json; output: Json;
  error: { name: string; message: string; code?: string } | null;
  attributes: Record<string, Json>; stateDelta: Record<string, Json>;
  redactedPaths: string[]; previousHash: string; hash: string;
}
export interface Insight {
  id: string; severity: 'info' | 'warning' | 'error'; title: string; detail: string;
  runId: string; eventSeq: number | null;
}
export interface Policy {
  id: string; name: string; outcome: 'allow' | 'deny' | 'require_approval';
  description: string; tool: string;
}
export interface Approval {
  id: string; runId: string; tool: string; policyId: string; reason: string;
  input: Json; status: 'pending' | 'approved' | 'rejected'; requestedAt: string;
  resolvedAt: string | null; actor: string | null; comment: string | null;
}
export interface Delivery {
  id: string; runId: string; recipient: string; subject: string; body: string;
  createdAt: string; channel: 'local-outbox'; disclaimer: string;
}
export interface RunDetail {
  run: Run; events: TraceEvent[]; approvals: Approval[]; insights: Insight[];
  integrity: { valid: boolean; checkedEvents: number; rootHash: string };
  deliveries: Delivery[];
  tools: { name: string; calls: number; failures: number; totalDurationMs: number; averageDurationMs: number }[];
}
export interface Scenario {
  id: ScenarioId; name: string; description: string; expectedStatus: RunStatus;
  faultInjection: string | null;
}
export interface Overview {
  stats: { runs: number; completed: number; failed: number; blocked: number; awaitingApproval: number; events: number; toolCalls: number; retries: number; averageDurationMs: number };
  runs: Run[]; insights: Insight[]; policies: Policy[];
}
export interface ReplaySnapshot {
  context: Record<string, Json>; messages: { role: string; content: Json; seq: number }[];
  toolOutputs: Record<string, Json>; failures: { seq: number; name: string; message: string }[];
  lastOutput: Json; lastPolicy: Json; pendingApproval: Json;
}
export interface ReplayResult { cursor: number; event: TraceEvent | null; snapshot: ReplaySnapshot; totalEvents: number; sideEffectsExecuted: 0 }
export interface Comparison {
  left: Run; right: Run; delta: { durationMs: number; toolCalls: number; errors: number; retries: number };
  changes: { label: string; left: string; right: string }[];
}

// HTTP responses and routes used by the UI. Mutations require X-AFR-Client: ui.
// GET /api/overview -> Overview
// GET /api/runs?q=&status= -> { runs: Run[] }
// GET /api/scenarios -> { scenarios: Scenario[] }
// POST /api/demos { scenarioId, name? } -> { runId: string }
// GET /api/runs/:id -> RunDetail (poll live/awaiting runs)
// GET /api/runs/:id/replay?cursor=0..eventCount -> ReplayResult
// GET /api/runs/:id/compare/:otherId -> Comparison
// POST /api/runs/:id/fork { scenarioId } -> { runId: string } (demo runs only)
// POST /api/approvals/:id/resolve { decision:'approve'|'reject', actor:string, comment?:string } -> { runId:string }
// GET /api/runs/:id/export?format=json|markdown|otlp -> downloadable file
// POST /api/import { recording: unknown } -> { runId:string, duplicate:boolean }
// GET /api/policies -> { policies: Policy[] }
// GET /api/outbox -> { deliveries: Delivery[] }
// GET /api/health -> { status:'ok', name:string, version:string, modelMode:'scripted-demo', mcpPath:'/mcp', collectorUrl:string }
// Errors: { error: { code: string, message: string } }, non-2xx status.
