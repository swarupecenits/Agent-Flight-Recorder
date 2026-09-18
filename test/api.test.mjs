import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createApplication } from '../server/app.mjs';
import { Store } from '../server/store.mjs';
import { FlightRecorder } from '../sdk/recorder.mjs';

async function start(options = {}) {
  const context = createApplication({ databasePath: ':memory:', serveStatic: false, ...options });
  const server = context.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { ...context, base, async stop() {
    await context.runner.idle();
    await new Promise(resolve => server.close(resolve));
    await context.close();
  } };
}
async function request(app, path, body, extra = {}) {
  const response = await fetch(`${app.base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-AFR-Client': 'ui' }), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function demo(app, scenarioId) {
  const response = await request(app, '/api/demos', { scenarioId });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  await app.runner.idle();
  return app.store.detail(response.body.runId);
}

test('all five instrumented scenarios produce their actual documented outcomes', async t => {
  const app = await start(); t.after(() => app.stop());
  const success = await demo(app, 'success');
  assert.equal(success.run.status, 'completed');
  assert.equal(success.deliveries.length, 1);
  assert.equal(success.deliveries[0].channel, 'local-outbox');
  assert.match(success.deliveries[0].body, /\$5,000,000/);
  assert.match(success.deliveries[0].body, /47\.1%/);
  const retry = await demo(app, 'retry');
  assert.equal(retry.run.status, 'completed');
  assert.equal(retry.run.metrics.retries, 1);
  assert.equal(retry.run.metrics.errors, 1);
  const blocked = await demo(app, 'blocked');
  assert.equal(blocked.run.status, 'blocked');
  assert.equal(blocked.deliveries.length, 0);
  assert.ok(!blocked.events.some(event => event.type === 'tool.started' && event.name === 'ReadFileTool'));
  assert.ok(!JSON.stringify(blocked.events).includes('The demo policy must prevent'));
  const failed = await demo(app, 'failure');
  assert.equal(failed.run.status, 'failed');
  assert.equal(failed.run.metrics.errors, 2);
  assert.equal(failed.run.metrics.retries, 1);
  const pending = await demo(app, 'approval');
  assert.equal(pending.run.status, 'awaiting_approval');
  assert.equal(pending.approvals[0].status, 'pending');
  assert.equal(pending.deliveries.length, 0);
  for (const detail of [success, retry, blocked, failed, pending]) assert.equal(detail.integrity.valid, true);
  const overview = await request(app, '/api/overview');
  assert.equal(overview.body.stats.runs, 5);
  assert.equal(overview.body.stats.awaitingApproval, 1);
  const filtered = await request(app, '/api/runs?q=retry');
  assert.deepEqual(filtered.body.runs.map(run => run.id), [retry.run.id]);
});

test('replay and exports are side-effect free; approval is explicit and executes only once', async t => {
  const app = await start(); t.after(() => app.stop());
  const pending = await demo(app, 'approval');
  const rootHash = pending.run.rootHash;
  for (let cursor = 0; cursor <= pending.events.length; cursor++) {
    const response = await request(app, `/api/runs/${pending.run.id}/replay?cursor=${cursor}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.sideEffectsExecuted, 0);
    assert.equal(response.body.cursor, cursor);
  }
  assert.equal(app.store.run(pending.run.id).rootHash, rootHash);
  assert.equal(app.store.deliveries().length, 0);
  assert.equal((await request(app, `/api/runs/${pending.run.id}/replay?cursor=-1`)).status, 422);
  assert.equal((await request(app, `/api/runs/${pending.run.id}/replay?cursor=999`)).status, 422);
  const approvePath = `/api/approvals/${pending.approvals[0].id}/resolve`;
  const approvals = await Promise.all([
    request(app, approvePath, { decision: 'approve', actor: 'Local test reviewer' }),
    request(app, approvePath, { decision: 'approve', actor: 'Duplicate click' }),
  ]);
  assert.ok(approvals.every(response => response.status === 200));
  await app.runner.idle();
  const detail = app.store.detail(pending.run.id);
  assert.equal(detail.run.status, 'completed');
  assert.equal(detail.deliveries.length, 1);
  assert.equal(detail.events.filter(event => event.type === 'tool.started' && event.name === 'SendEmailTool').length, 1);
  assert.equal(detail.events.filter(event => event.type === 'approval.resolved').length, 1);
  assert.equal((await request(app, approvePath, { decision: 'reject', actor: 'Too late' })).status, 409);
  const exported = await request(app, `/api/runs/${detail.run.id}/export?format=json`);
  assert.equal(exported.body.format, 'agent-flight-recorder');
  const imported = await request(app, '/api/import', { recording: exported.body });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.duplicate, true);
  const report = await fetch(`${app.base}/api/runs/${detail.run.id}/export?format=markdown`);
  assert.match(report.headers.get('content-disposition'), /attachment/);
  assert.match(await report.text(), /not hidden model reasoning/);
  const otlp = await request(app, `/api/runs/${detail.run.id}/export?format=otlp`);
  const spans = otlp.body.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, 5);
  assert.match(spans[0].traceId, /^[0-9a-f]{32}$/);
  assert.match(spans[0].spanId, /^[0-9a-f]{16}$/);
  assert.match(spans[0].startTimeUnixNano, /^\d+$/);
  assert.equal(app.store.deliveries().length, 1);
});

test('rejection blocks delivery and what-if rerun creates a linked, comparable new execution', async t => {
  const app = await start(); t.after(() => app.stop());
  const pending = await demo(app, 'approval');
  await request(app, `/api/approvals/${pending.approvals[0].id}/resolve`, { decision: 'reject', actor: 'Local reviewer', comment: 'Do not share externally' });
  await app.runner.idle();
  assert.equal(app.store.run(pending.run.id).status, 'blocked');
  assert.equal(app.store.deliveries().length, 0);
  const fork = await request(app, `/api/runs/${pending.run.id}/fork`, { scenarioId: 'success' });
  assert.equal(fork.status, 201);
  assert.notEqual(fork.body.runId, pending.run.id);
  await app.runner.idle();
  const comparison = await request(app, `/api/runs/${pending.run.id}/compare/${fork.body.runId}`);
  assert.equal(comparison.body.right.parentRunId, pending.run.id);
  assert.equal(comparison.body.left.status, 'blocked');
  assert.equal(comparison.body.right.status, 'completed');
  assert.equal(comparison.body.delta.toolCalls, 1);
});

test('framework-neutral SDK really captures through HTTP; write tokens never appear in reads', async t => {
  const app = await start(); t.after(() => app.stop());
  const recorder = new FlightRecorder({ baseUrl: app.base });
  let id, token;
  await recorder.run({ name: 'Actual HTTP integration', agentName: 'independent-client', input: { value: 3 } }, async run => {
    id = run.id; token = run.writeToken;
    await run.prompt('Square the input');
    await run.decision('Call the numeric tool', { operation: 'square' });
    return run.tool('SquareTool', { value: 3 }, async () => ({ value: 9 }));
  });
  const detail = await request(app, `/api/runs/${id}`);
  assert.equal(detail.body.run.origin, 'sdk');
  assert.equal(detail.body.run.status, 'completed');
  assert.equal(detail.body.integrity.valid, true);
  assert.ok(!JSON.stringify(detail.body).includes(token));
  const badWrite = await request(app, `/api/capture/runs/${id}/events`, { events: [{ type: 'decision', name: 'Unauthorized' }] });
  assert.equal(badWrite.status, 403);
  assert.equal((await request(app, `/api/runs/${id}/fork`, { scenarioId: 'success' })).status, 422);
});

test('MCP initialization and all five read-only tools use the real stored recordings', async t => {
  const app = await start(); t.after(() => app.stop());
  const recorded = await demo(app, 'retry');
  const rpc = async (method, params) => request(app, '/mcp', { jsonrpc: '2.0', id: randomUUID(), method, params },
    { Accept: 'application/json, text/event-stream' });
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'contract-test', version: '1' } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, 'agent-flight-recorder');
  const tools = await rpc('tools/list', {});
  assert.equal(tools.body.result.tools.length, 5);
  assert.ok(tools.body.result.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const cases = [
    ['list_runs', {}],
    ['get_trace', { runId: recorded.run.id, afterSeq: 0, limit: 3 }],
    ['replay_state', { runId: recorded.run.id, cursor: 3 }],
    ['find_failures', { runId: recorded.run.id }],
    ['compare_runs', { leftRunId: recorded.run.id, rightRunId: recorded.run.id }],
  ];
  for (const [name, args] of cases) {
    const response = await rpc('tools/call', { name, arguments: args });
    assert.equal(response.status, 200);
    assert.ok(!response.body.result.isError, JSON.stringify(response.body));
    const body = JSON.parse(response.body.result.content[0].text);
    assert.equal(body.recordedDataIsUntrusted, true);
    if (name === 'get_trace') { assert.equal(body.result.events.length, 3); assert.equal(body.result.hasMore, true); }
    if (name === 'replay_state') assert.equal(body.result.sideEffectsExecuted, 0);
  }
  assert.equal(app.store.run(recorded.run.id).rootHash, recorded.run.rootHash);
  assert.equal((await request(app, '/mcp')).status, 405);
});

test('validation and browser boundaries reject malformed or cross-origin mutations', async t => {
  const app = await start(); t.after(() => app.stop());
  assert.equal((await request(app, '/api/demos', { scenarioId: 'not-a-scenario' })).status, 422);
  assert.equal((await request(app, '/api/demos', { scenarioId: 'success', command: 'arbitrary code' })).status, 422);
  assert.equal((await request(app, '/api/demos', { scenarioId: 'success' }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request(app, '/api/demos', { scenarioId: 'success' }, { 'X-AFR-Client': '' })).status, 403);
  const invalidJson = await fetch(`${app.base}/api/demos`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AFR-Client': 'ui' }, body: '{broken' });
  assert.equal(invalidJson.status, 400);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const probe = httpRequest(`${app.base}/api/health`, { headers: { Host: 'attacker.example' } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    probe.on('error', reject);
    probe.end();
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await request(app, '/api/not-a-route')).status, 404);
  assert.equal(app.store.listRuns().length, 0);
});

test('disk persistence survives restart; approvals resume safely and abandoned SDK runs are marked interrupted', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'afr-persistence-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'recordings.sqlite');
  const first = await start({ databasePath: path });
  let second;
  try {
    const pending = await demo(first, 'approval');
    const sdk = first.store.createRun({ name: 'Abandoned external capture', agentName: 'external-agent' });
    assert.throws(() => new Store(path), /already open/);
    await first.stop();
    second = await start({ databasePath: path });
    assert.equal(second.store.run(pending.run.id).status, 'awaiting_approval');
    assert.equal(second.store.deliveries().length, 0);
    assert.equal(second.store.run(sdk.runId).status, 'interrupted');
    assert.equal(second.store.detail(sdk.runId).integrity.valid, true);
    await request(second, `/api/approvals/${pending.approvals[0].id}/resolve`, { decision: 'approve', actor: 'Reviewer after restart' });
    await second.runner.idle();
    assert.equal(second.store.run(pending.run.id).status, 'completed');
    assert.equal(second.store.deliveries().length, 1);
    assert.equal(second.store.detail(pending.run.id).integrity.valid, true);
  } finally {
    if (second) await second.stop();
  }
});
