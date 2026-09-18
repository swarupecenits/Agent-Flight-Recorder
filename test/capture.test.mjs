import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { FlightRecorder } from '../sdk/recorder.mjs';
import { localTransport, evaluatePolicy } from '../server/demo.mjs';
import { redact } from '../sdk/privacy.mjs';
import { replay, canonical, digest, verifyChain } from '../shared/trace.mjs';
import { otlpExport } from '../server/exports.mjs';

const input = { name: 'Capture contract', agentName: 'test-agent', input: { prompt: 'Inspect the report' } };
function workspace(t) { const store = new Store(); t.after(() => store.close()); return store; }

test('redaction is recursive, handles credential text, and rejects non-JSON data', () => {
  const source = { headers: { Authorization: 'Bearer top-secret-value', 'api-key': 'test-sensitive' },
    body: 'Bearer abc.def https://example.test/path?sig=private-value&other=1', password: 'never-store-this' };
  const result = redact(source);
  assert.equal(result.value.headers.Authorization, '[REDACTED]');
  assert.ok(!JSON.stringify(result.value).includes('private-value'));
  assert.ok(!JSON.stringify(result.value).includes('never-store-this'));
  assert.ok(result.paths.length >= 4);
  assert.equal(source.password, 'never-store-this');
  const circular = {}; circular.self = circular;
  assert.throws(() => redact(circular), /circular/);
  assert.throws(() => redact({ value: NaN }), /finite/);
  assert.throws(() => redact({ date: new Date() }), /plain JSON/);
});

test('canonical hashing is independent of property order', () => {
  assert.equal(canonical({ z: [2, { b: 1, a: 2 }], a: true }), canonical({ a: true, z: [2, { a: 2, b: 1 }] }));
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
});

test('the fixed catalog denies unknown and inherited property names', () => {
  for (const fileId of ['__proto__', 'constructor', 'toString', '../outside.json', 'unknown']) {
    assert.equal(evaluatePolicy('ReadFileTool', { fileId }).outcome, 'deny');
  }
  assert.equal(evaluatePolicy('ReadFileTool', { fileId: 'quarterly-sales' }).outcome, 'allow');
});

test('append ordering, idempotency, transaction rollback, closure and replay are consistent', t => {
  const store = workspace(t);
  const run = store.createRun(input);
  const event = { id: randomUUID(), type: 'decision', name: 'Select report', stateDelta: { fileId: 'quarterly-sales' } };
  const first = store.capture(run.runId, run.writeToken, [event])[0];
  assert.equal(first.seq, 2);
  assert.equal(store.capture(run.runId, run.writeToken, [event])[0].id, first.id);
  assert.equal(store.run(run.runId).eventCount, 2);
  assert.throws(() => store.capture(run.runId, run.writeToken, [{ ...event, name: 'Different payload' }]), /different payload/);
  assert.throws(() => store.capture(run.runId, run.writeToken, [
    { type: 'decision', name: 'Must roll back' }, { type: 'run.completed', name: 'Forbidden lifecycle bypass' },
  ]), /lifecycle/);
  assert.equal(store.run(run.runId).eventCount, 2);
  const initial = replay(store.events(run.runId), 0);
  assert.deepEqual(initial.snapshot.context, {});
  assert.equal(initial.sideEffectsExecuted, 0);
  assert.equal(replay(store.events(run.runId), 2).snapshot.context.fileId, 'quarterly-sales');
  store.finish(run.runId, run.writeToken, { output: { answer: 'done' } });
  const detail = store.detail(run.runId);
  assert.equal(detail.run.status, 'completed');
  assert.equal(detail.integrity.valid, true);
  assert.throws(() => store.capture(run.runId, run.writeToken, [{ type: 'decision', name: 'Too late' }]), /immutable/);
  assert.throws(() => store.capture(run.runId, 'wrong-token', [event]), /write token/);
  assert.ok(!JSON.stringify(detail).includes(run.writeToken));
});

test('SDK records actual nested and concurrent tool calls and measured model usage', async t => {
  const store = workspace(t);
  const recorder = new FlightRecorder({ transport: localTransport(store) });
  let id;
  const result = await recorder.run({ ...input, metadata: { apiKey: 'sensitive-metadata' } }, async run => {
    id = run.id;
    await run.prompt({ text: 'Find and summarize', authorization: 'sensitive-prompt' });
    const values = await run.tool('Parent', {}, async () => Promise.all([
      run.tool('Child A', {}, async () => ({ value: 4 })),
      run.tool('Child B', {}, async () => ({ value: 5 })),
    ]));
    return run.model('External-model-adapter', { values }, async () => ({ text: '9', measured: { inputTokens: 11, outputTokens: 2 } }),
      { getUsage: value => value.measured, attributes: { provider: 'test-callback' } });
  });
  assert.equal(result.text, '9');
  const detail = store.detail(id);
  const parent = detail.events.find(event => event.type === 'tool.started' && event.name === 'Parent');
  for (const child of detail.events.filter(event => event.type === 'tool.started' && event.name.startsWith('Child'))) assert.equal(child.parentSpanId, parent.spanId);
  assert.equal(detail.run.metrics.inputTokens, 11);
  assert.equal(detail.run.metrics.outputTokens, 2);
  assert.equal(detail.run.metrics.toolCalls, 3);
  assert.equal(detail.integrity.valid, true);
  assert.ok(!JSON.stringify(detail).includes('sensitive-metadata'));
  assert.ok(!JSON.stringify(detail).includes('sensitive-prompt'));
  assert.ok(detail.events[0].redactedPaths.length > 0);
});

test('retry records actual attempts; post-success capture errors never retry side effects', async t => {
  const store = workspace(t);
  const recorder = new FlightRecorder({ transport: localTransport(store) });
  let attempts = 0, retriedId;
  await recorder.run(input, async run => {
    retriedId = run.id;
    return run.tool('Idempotent read', {}, async () => {
      if (++attempts === 1) throw new Error('Transient read failure');
      return { recovered: true };
    }, { attempts: 2, retryDelayMs: 0 });
  });
  assert.equal(attempts, 2);
  assert.equal(store.run(retriedId).metrics.retries, 1);
  assert.equal(store.run(retriedId).metrics.errors, 1);
  let sideEffects = 0, failedId;
  await assert.rejects(() => recorder.run(input, async run => {
    failedId = run.id;
    return run.tool('One-time action', {}, async () => { sideEffects++; return new Map(); }, { attempts: 3 });
  }), /plain JSON/);
  assert.equal(sideEffects, 1);
  assert.equal(store.run(failedId).status, 'failed');
  assert.ok(store.detail(failedId).insights.some(insight => insight.id.endsWith(':incomplete')));
});

test('capture is fail-closed before tool execution', async () => {
  let executions = 0;
  const recorder = new FlightRecorder({ transport: {
    createRun: () => ({ runId: randomUUID(), traceId: 'a'.repeat(32), writeToken: 'test' }),
    append: () => { throw new Error('Capture unavailable'); },
    finish: () => ({ status: 'failed' }),
  } });
  await assert.rejects(() => recorder.run(input, run => run.tool('Side effect', {}, async () => ++executions)), /Capture unavailable/);
  assert.equal(executions, 0);
});

test('import verifies chains, preserves immutable data, detects modifications and deduplicates', t => {
  const source = workspace(t), target = workspace(t);
  const run = source.createRun(input);
  source.finish(run.runId, run.writeToken, { status: 'completed', output: 'Finished' });
  const recording = source.exportRecording(run.runId);
  assert.equal(target.importRecording(recording).duplicate, false);
  assert.equal(target.importRecording(recording).duplicate, true);
  assert.equal(target.run(run.runId).origin, 'import');
  assert.equal(target.detail(run.runId).integrity.valid, true);
  assert.deepEqual(target.events(run.runId), source.events(run.runId));
  assert.throws(() => target.capture(run.runId, run.writeToken, [{ type: 'decision', name: 'Change imported trace' }]), /Imported recordings/);
  const changed = structuredClone(recording);
  changed.events[1].output = 'Modified';
  assert.throws(() => target.importRecording(changed), /modified/);
  const missing = structuredClone(recording); missing.events.splice(1, 1);
  assert.equal(verifyChain(missing.header, missing.events, missing.rootHash).valid, false);
  assert.throws(() => target.importRecording({ ...recording, status: 'failed' }), /lifecycle/);
});

test('event-size and event-count limits leave reserved room for an explicit terminal record', t => {
  const store = workspace(t);
  const run = store.createRun(input);
  assert.throws(() => store.capture(run.runId, run.writeToken, [{ type: 'prompt', name: 'Too large', input: 'x'.repeat(70_000) }]), /64 KiB/);
  assert.equal(store.run(run.runId).eventCount, 1);
  const drafts = Array.from({ length: 997 }, (_, index) => ({ type: 'decision', name: `Small event ${index}` }));
  store.capture(run.runId, run.writeToken, drafts);
  assert.throws(() => store.capture(run.runId, run.writeToken, [{ type: 'decision', name: 'No space' }]), /reserved/);
  store.finish(run.runId, run.writeToken, { status: 'failed', error: { name: 'LimitReached', message: 'The caller stopped because capture was full.' }, output: 'Stopped explicitly' });
  assert.equal(store.run(run.runId).eventCount, 1000);
  assert.equal(store.detail(run.runId).integrity.valid, true);
});

test('unknown token usage is not invented and malformed measured usage is rejected', t => {
  const store = workspace(t);
  const run = store.createRun(input);
  assert.equal(store.run(run.runId).metrics.inputTokens, null);
  assert.throws(() => store.capture(run.runId, run.writeToken, [
    { type: 'model.completed', name: 'Invalid usage', attributes: { usage: { inputTokens: 'unknown', outputTokens: 2 } } },
  ]), /non-negative integer/);
  assert.equal(store.run(run.runId).eventCount, 1);
});

test('an unrecordable final output ends as failed rather than remaining falsely active', async t => {
  const store = workspace(t);
  const recorder = new FlightRecorder({ transport: localTransport(store) });
  let id;
  await assert.rejects(() => recorder.run(input, async run => { id = run.id; return 'x'.repeat(70_000); }), /64 KiB/);
  const detail = store.detail(id);
  assert.equal(detail.run.status, 'failed');
  assert.equal(detail.events.at(-1).type, 'run.failed');
  assert.ok(detail.insights.some(insight => insight.id.endsWith(':run-failure')));
  assert.equal(detail.integrity.valid, true);
});

test('partial imports freeze elapsed time and OTLP marks clock-skew adjustments without changing the recording', t => {
  const source = workspace(t), target = workspace(t);
  const run = source.createRun(input);
  const start = '2026-09-16T12:00:10.000Z', end = '2026-09-16T12:00:05.000Z';
  source.capture(run.runId, run.writeToken, [
    { type: 'tool.started', name: 'Clock-skew example', spanId: 'a'.repeat(16), timestamp: start },
    { type: 'tool.completed', name: 'Clock-skew example', spanId: 'a'.repeat(16), timestamp: end, output: 'done' },
  ]);
  target.importRecording(source.exportRecording(run.runId));
  const detail = target.detail(run.runId);
  assert.equal(detail.run.readOnly, true);
  assert.equal(detail.run.metrics.durationMs, Math.max(0, Date.parse(detail.events.at(-1).recordedAt) - Date.parse(detail.run.startedAt)));
  const span = otlpExport(detail).resourceSpans[0].scopeSpans[0].spans[1];
  assert.equal(span.startTimeUnixNano, span.endTimeUnixNano);
  assert.ok(span.attributes.some(item => item.key === 'afr.clock_skew_detected'));
  assert.equal(target.events(run.runId).at(-1).timestamp, end);
});
