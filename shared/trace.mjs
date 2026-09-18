import { createHash } from 'node:crypto';

export const EVENT_TYPES = [
  'run.started', 'prompt', 'decision', 'tool.started', 'tool.completed', 'tool.failed',
  'model.started', 'model.completed', 'model.failed', 'retry', 'policy.evaluated',
  'approval.requested', 'approval.resolved', 'output', 'run.completed', 'run.failed',
  'run.blocked', 'run.interrupted',
];
export const TERMINAL_TYPES = new Set(['run.completed', 'run.failed', 'run.blocked', 'run.interrupted']);
export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked', 'interrupted']);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function hashEvent(event) {
  const { hash: ignored, ...body } = event;
  return digest(body);
}
export function verifyChain(header, events, expectedRoot) {
  let previous = digest(header);
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    if (event.seq !== index + 1 || event.runId !== header.id || event.traceId !== header.traceId ||
        event.previousHash !== previous || hashEvent(event) !== event.hash || ids.has(event.id)) {
      return { valid: false, checkedEvents: index, rootHash: previous };
    }
    ids.add(event.id);
    previous = event.hash;
  }
  return { valid: previous === expectedRoot, checkedEvents: events.length, rootHash: previous };
}
export function replay(events, cursor) {
  const snapshot = { context: {}, messages: [], toolOutputs: {}, failures: [], lastOutput: null, lastPolicy: null, pendingApproval: null };
  for (const event of events.slice(0, cursor)) {
    snapshot.context = { ...snapshot.context, ...event.stateDelta };
    if (event.type === 'prompt') snapshot.messages.push({ role: 'user', content: event.input, seq: event.seq });
    if (event.type === 'tool.completed') snapshot.toolOutputs = { ...snapshot.toolOutputs, [event.name]: event.output };
    if (event.type === 'tool.failed' || event.type === 'model.failed') {
      snapshot.failures.push({ seq: event.seq, name: event.name, message: event.error?.message ?? 'Failure without an error message' });
    }
    if (event.type === 'policy.evaluated') snapshot.lastPolicy = event.attributes;
    if (event.type === 'approval.requested') snapshot.pendingApproval = { ...event.attributes, input: event.input };
    if (event.type === 'approval.resolved') snapshot.pendingApproval = null;
    if (event.type === 'output') {
      snapshot.lastOutput = event.output;
      snapshot.messages.push({ role: 'assistant', content: event.output, seq: event.seq });
    }
  }
  return { cursor, event: cursor ? events[cursor - 1] : null, snapshot, totalEvents: events.length, sideEffectsExecuted: 0 };
}
export function metricsFor(run, events) {
  const measuredUsage = events.filter(event => event.type === 'model.completed' && event.attributes.usage);
  const sumUsage = key => measuredUsage.length ? measuredUsage.reduce((sum, event) => sum + event.attributes.usage[key], 0) : null;
  const end = run.endedAt ?? (run.readOnly ? events.at(-1)?.recordedAt ?? run.startedAt : new Date().toISOString());
  return {
    durationMs: Math.max(0, Date.parse(end) - Date.parse(run.startedAt)),
    toolCalls: events.filter(event => event.type === 'tool.started').length,
    errors: events.filter(event => event.type === 'tool.failed' || event.type === 'model.failed').length,
    retries: events.filter(event => event.type === 'retry').length,
    blocked: events.filter(event => event.type === 'policy.evaluated' && event.attributes.outcome === 'deny').length,
    approvals: events.filter(event => event.type === 'approval.requested').length,
    inputTokens: sumUsage('inputTokens'), outputTokens: sumUsage('outputTokens'),
  };
}
export function analyzeRun(run, events) {
  const insights = [];
  const add = (id, severity, title, detail, event) => insights.push({ id: `${run.id}:${id}`, severity, title, detail, runId: run.id, eventSeq: event?.seq ?? null });
  const failures = events.filter(event => event.type === 'tool.failed' || event.type === 'model.failed');
  if (failures.length) {
    add('failures', run.status === 'failed' ? 'error' : 'warning', `${failures.length} failed attempt${failures.length === 1 ? '' : 's'}`,
      `${failures[0].name}: ${failures[0].error?.message ?? 'No error message recorded'}. ${run.status === 'completed' ? 'The run ultimately recovered.' : 'Inspect the failure event and its input.'}`, failures[0]);
  }
  const terminalFailure = events.find(event => (event.type === 'run.failed' || event.type === 'run.interrupted') && event.error);
  if (!failures.length && terminalFailure) {
    add('run-failure', 'error', 'Execution ended with an error', `${terminalFailure.error.name}: ${terminalFailure.error.message}`, terminalFailure);
  }
  const retries = events.filter(event => event.type === 'retry');
  if (retries.length) add('retry', 'warning', `${retries.length} explicit retr${retries.length === 1 ? 'y' : 'ies'}`, 'Retry events retain the failed attempt, reason, next attempt number, and delay. Only opted-in tool callbacks are retried.', retries[0]);
  const blocked = events.find(event => event.type === 'policy.evaluated' && event.attributes.outcome === 'deny');
  if (blocked) add('blocked', 'warning', 'A policy prevented tool execution', String(blocked.attributes.reason), blocked);
  const approval = events.find(event => event.type === 'approval.requested');
  if (approval) add('approval', run.status === 'awaiting_approval' ? 'warning' : 'info', run.status === 'awaiting_approval' ? 'Waiting for human approval' : 'Human approval boundary recorded',
    'The outbound sandbox action is separate from observation. Replay cannot approve or execute it.', approval);
  const timed = events.filter(event => (event.type === 'tool.completed' || event.type === 'model.completed') && event.durationMs !== null);
  const slowest = [...timed].sort((a, b) => b.durationMs - a.durationMs)[0];
  if (slowest) add('latency', 'info', `Slowest measured operation: ${slowest.name}`, `${slowest.durationMs.toFixed(1)} ms of callback execution, excluding recorder HTTP writes. Run wall time also includes pauses and approval wait.`, slowest);
  const redacted = events.find(event => event.redactedPaths.length);
  if (redacted) add('redaction', 'info', 'Credential-pattern redaction applied', 'Inspect redactedPaths for affected fields. Pattern redaction is not a complete DLP guarantee.', redacted);
  const unfinished = events.filter(event => event.type.endsWith('.started') && event.spanId &&
    !events.some(other => other.spanId === event.spanId && /\.(completed|failed)$/.test(other.type)));
  if (unfinished.length && TERMINAL_STATUSES.has(run.status)) {
    add('incomplete', 'warning', 'An operation has no recorded end', 'The recording ended with an open span; its outcome is unknown. It is not assumed to have succeeded.', unfinished[0]);
  }
  const names = [...new Set(events.filter(event => event.type === 'tool.started').map(event => event.name))];
  const tools = names.map(name => {
    const ends = events.filter(event => event.name === name && (event.type === 'tool.completed' || event.type === 'tool.failed'));
    const totalDurationMs = ends.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
    return { name, calls: events.filter(event => event.type === 'tool.started' && event.name === name).length,
      failures: ends.filter(event => event.type === 'tool.failed').length, totalDurationMs,
      averageDurationMs: ends.length ? totalDurationMs / ends.length : 0 };
  });
  return { insights, tools };
}
