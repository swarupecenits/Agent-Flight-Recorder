import { digest } from '../shared/trace.mjs';

const printable = value => typeof value === 'string' ? value : JSON.stringify(value);
function brief(value) {
  const text = printable(value) ?? 'No value';
  return text.length > 300 ? `${text.slice(0, 300)}... [truncated; inspect the recording for the full value]` : text;
}
export function compareRuns(leftDetail, rightDetail) {
  const left = leftDetail.run, right = rightDetail.run;
  const path = detail => detail.events.filter(event => event.type === 'tool.started').map(event => event.name).join(' > ') || 'No executed tools';
  const outcomes = detail => detail.events.filter(event => event.type === 'policy.evaluated').map(event => `${event.attributes.tool}: ${event.attributes.outcome}`).join('; ') || 'No recorded policies';
  const output = detail => detail.events.filter(event => event.type === 'output').at(-1)?.output ?? null;
  return { left, right, delta: Object.fromEntries(['durationMs', 'toolCalls', 'errors', 'retries'].map(key => [key, right.metrics[key] - left.metrics[key]])),
    changes: [
      { label: 'Outcome', left: left.status, right: right.status },
      { label: 'Tool path', left: path(leftDetail), right: path(rightDetail) },
      { label: 'Policy outcomes', left: outcomes(leftDetail), right: outcomes(rightDetail) },
      { label: 'Final output', left: brief(output(leftDetail)), right: brief(output(rightDetail)) },
    ] };
}
const markdownText = value => String(value).replace(/[\\`*{}\[\]()#+.!|>_-]/g, '\\$&').replace(/</g, '&lt;').replace(/\r?\n/g, ' ');
function jsonBlock(value) {
  const text = JSON.stringify(value, null, 2);
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map(value => value.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}json\n${text}\n${fence}`;
}
export function markdownReport(detail) {
  const { run, events, integrity, insights, deliveries } = detail;
  return [
    `# Agent Flight Recorder: ${markdownText(run.name)}`, '',
    `Status: **${run.status}** | Origin: ${run.origin} | Agent: ${markdownText(run.agentName)}`,
    `Run ID: ${run.id}`, `Trace ID: ${run.traceId}`, `Started: ${run.startedAt}`,
    `Ended: ${run.endedAt ?? 'Not ended; this is a snapshot'}`, '',
    '## Recording semantics', '',
    'This report contains observable instrumentation and explicit annotations, not hidden model reasoning.',
    'Replay only reconstructs recorded state; it does not re-execute tools.',
    'Demo agents use fictional fixtures and scripted formatting. Outbox receipts are local only, not sent email.', '',
    '## Metrics', '', jsonBlock(run.metrics), '',
    '## Hash-chain consistency', '',
    `Consistent: ${integrity.valid}. Events checked: ${integrity.checkedEvents}. Root: ${integrity.rootHash}.`,
    'This is an unkeyed consistency check, not a digital signature or protection against an attacker who can rewrite and rehash the entire file.', '',
    '## Findings', '',
    ...insights.map(value => `- ${markdownText(value.title)}: ${markdownText(value.detail)}${value.eventSeq ? ` (event ${value.eventSeq})` : ''}`), '',
    '## Timeline', '',
    '| Sequence | Event | Name | Callback ms |', '| --- | --- | --- | --- |',
    ...events.map(event => `| ${event.seq} | ${event.type} | ${markdownText(event.name)} | ${event.durationMs === null ? '-' : event.durationMs.toFixed(2)} |`),
    '', '## Local sandbox receipts', '', jsonBlock(deliveries), '',
    '## Full event payloads', '', jsonBlock(events), '',
  ].join('\n');
}
const nanos = timestamp => (BigInt(Date.parse(timestamp)) * 1_000_000n).toString();
const attribute = (key, value) => ({ key, value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) } });
function exportedTimeRange(start, end) {
  const skew = Date.parse(end) < Date.parse(start);
  return { startTimeUnixNano: nanos(start), endTimeUnixNano: nanos(skew ? start : end),
    annotations: skew ? [attribute('afr.clock_skew_detected', true), attribute('afr.recorded_end_timestamp', end)] : [] };
}
export function otlpExport(detail) {
  const { run, events } = detail;
  const rootId = digest(`root:${run.id}`).slice(0, 16);
  const rootRange = exportedTimeRange(run.startedAt, run.endedAt ?? events.at(-1)?.recordedAt ?? run.startedAt);
  const root = {
    traceId: run.traceId, spanId: rootId, name: run.name, kind: 1,
    startTimeUnixNano: rootRange.startTimeUnixNano,
    endTimeUnixNano: rootRange.endTimeUnixNano,
    status: { code: run.status === 'failed' || run.status === 'interrupted' ? 2 : run.status === 'completed' ? 1 : 0 },
    attributes: [attribute('agent.name', run.agentName), attribute('afr.run_id', run.id),
      attribute('afr.origin', run.origin), attribute('afr.status', run.status), attribute('afr.snapshot', !run.endedAt), ...rootRange.annotations],
    events: events.map(event => ({ timeUnixNano: nanos(event.timestamp), name: event.type,
      attributes: [attribute('afr.seq', event.seq), attribute('afr.name', event.name),
        attribute('afr.input', event.input), attribute('afr.output', event.output),
        attribute('afr.attributes', event.attributes), attribute('afr.error', event.error)] })),
  };
  const spans = [root];
  for (const start of events.filter(event => (event.type === 'tool.started' || event.type === 'model.started') && event.spanId)) {
    const end = events.find(event => event.spanId === start.spanId && (event.type.endsWith('.completed') || event.type.endsWith('.failed')));
    const range = exportedTimeRange(start.timestamp, end?.timestamp ?? run.endedAt ?? events.at(-1).recordedAt);
    spans.push({
      traceId: run.traceId, spanId: start.spanId, parentSpanId: start.parentSpanId ?? rootId,
      name: start.name, kind: 1,
      startTimeUnixNano: range.startTimeUnixNano,
      endTimeUnixNano: range.endTimeUnixNano,
      status: { code: !end ? 0 : end.error ? 2 : 1, ...(!end ? { message: 'Open span at snapshot; outcome unknown' } : {}) },
      attributes: [attribute('afr.operation', start.type.split('.')[0]), attribute('afr.input', start.input),
        attribute('afr.output', end?.output ?? null), attribute('afr.incomplete', !end),
        attribute('afr.callback_duration_ms', end?.durationMs ?? null), ...range.annotations],
    });
  }
  return { resourceSpans: [{ resource: { attributes: [attribute('service.name', run.agentName)] },
    scopeSpans: [{ scope: { name: 'agent-flight-recorder', version: '1.0.0' }, spans }] }] };
}
