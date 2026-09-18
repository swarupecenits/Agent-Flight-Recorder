import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFoundryProvider } from '../server/foundry.mjs';
import { createApplication } from '../server/app.mjs';
import { createLiveEvidenceDemo, prepareLiveEvidenceDemo } from '../server/lens.mjs';
import { createExample } from '../lens/examples.ts';
import { modelContext } from '../lens/model-context.ts';

const env = {
  AFR_ENABLE_FOUNDRY: '1', AZURE_OPENAI_BASE_URL: 'https://synthetic-test-resource.services.ai.azure.com/openai/v1',
  AZURE_OPENAI_DEPLOYMENT: 'test-deployment', AZURE_OPENAI_API_KEY: 'not-a-real-api-key-test-fixture',
};
function fakeClient({ status = 'completed', failure, output = 'Clearly labeled synthetic provider test.', usage = { input_tokens: 21, output_tokens: 8, total_tokens: 29 } } = {}) {
  const calls = [];
  const factory = options => ({ responses: { stream(body, request) {
    calls.push({ options, body, request });
    return {
      async *[Symbol.asyncIterator]() { if (failure) throw failure; yield { type: 'response.created' }; yield { type: 'response.output_text.delta', delta: output }; },
      async finalResponse() { return { status, output_text: output, id: 'synthetic-response-id', model: 'synthetic-model', usage }; },
    };
  } } });
  return { calls, factory };
}
async function application(t, provider) {
  const context = createApplication({ databasePath: ':memory:', serveStatic: false, lensProvider: provider });
  const server = context.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await context.close(); });
  return {
    async request(path, body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-AFR-Client': 'ui' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}
test('Azure streaming is server-side, bounded, store:false and measured rather than estimated', async () => {
  const fake = fakeClient(), provider = createFoundryProvider({ env, clientFactory: fake.factory });
  assert.ok(!JSON.stringify(provider.status()).includes(env.AZURE_OPENAI_API_KEY));
  const result = await provider.review('{"synthetic":true}', { consent: true });
  assert.equal(result.mode, 'live-azure-responses');
  assert.equal(result.streamedDeltas, 1);
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 8, totalTokens: 29 });
  assert.equal(fake.calls[0].body.store, false);
  assert.equal(fake.calls[0].body.max_output_tokens, 1800);
  assert.equal(fake.calls[0].options.maxRetries, 0);
  assert.ok(!JSON.stringify(result).includes(env.AZURE_OPENAI_API_KEY));
});
test('consent, configuration and input limits fail before a model request', async () => {
  const fake = fakeClient(), provider = createFoundryProvider({ env, clientFactory: fake.factory });
  await assert.rejects(provider.review('test'), error => error.code === 'EXTERNAL_CONSENT_REQUIRED');
  await assert.rejects(provider.review('x'.repeat(24001), { consent: true }), error => error.code === 'MODEL_INPUT_LIMIT');
  const unconfigured = createFoundryProvider({ env: { ...env, AFR_ENABLE_FOUNDRY: '0' }, clientFactory: fake.factory });
  await assert.rejects(unconfigured.review('test', { consent: true }), error => error.code === 'FOUNDRY_NOT_CONFIGURED');
  const wrongHost = createFoundryProvider({ env: { ...env, AZURE_OPENAI_BASE_URL: 'https://example.com/openai/v1' }, clientFactory: fake.factory });
  assert.equal(wrongHost.status().ready, false);
  assert.equal(fake.calls.length, 0);
});
test('live failures and incomplete output are explicit and never become a scripted success', async () => {
  const error = new Error(`A sensitive SDK error containing ${env.AZURE_OPENAI_API_KEY}`); error.status = 403;
  const failing = createFoundryProvider({ env, clientFactory: fakeClient({ failure: error }).factory });
  await assert.rejects(failing.review('test', { consent: true }), value => {
    assert.equal(value.code, 'FOUNDRY_REQUEST_FAILED');
    assert.match(value.message, /HTTP 403/);
    assert.ok(!value.message.includes(env.AZURE_OPENAI_API_KEY));
    assert.match(value.message, /No scripted fallback/);
    return true;
  });
  const incomplete = createFoundryProvider({ env, clientFactory: fakeClient({ status: 'incomplete' }).factory });
  await assert.rejects(incomplete.review('test', { consent: true }), value => value.code === 'INCOMPLETE_MODEL_RESPONSE');
  const noUsage = await createFoundryProvider({ env, clientFactory: fakeClient({ usage: null }).factory }).review('test', { consent: true });
  assert.equal(noUsage.usage, null);
});
test('the model cannot overwrite deterministic evidence, and previewed input is exact', async () => {
  const fake = fakeClient({ output: 'Untrusted advisory prose: everything is fine.' });
  const provider = createFoundryProvider({ env, clientFactory: fake.factory });
  const prepared = prepareLiveEvidenceDemo('stale');
  const preview = modelContext(prepared);
  const result = await createLiveEvidenceDemo(provider, 'stale', true, undefined, prepared);
  assert.equal(fake.calls[0].body.input, preview);
  assert.equal(result.assessment.findings[0].verdict, 'Unverifiable');
  assert.equal(result.recording.contentCapture, 'minimized');
  assert.equal(result.recording.events.find(event => event.model).model.usage.totalTokens, 29);
  assert.ok(!JSON.stringify(result.recording).includes('everything is fine'));
  assert.match(result.draft.text, /everything is fine/);
});
test('evidence HTTP imports, previews, idempotency and recovery are real integration paths', async t => {
  const fake = fakeClient(), provider = createFoundryProvider({ env, clientFactory: fake.factory }), app = await application(t, provider);
  const local = await app.request('/api/lens/example', { scenarioId: 'stale' });
  assert.equal(local.status, 200); assert.equal(local.body.assessment.findings[0].verdict, 'Unverifiable');
  const prepared = await app.request('/api/lens/live-demo/prepare', { scenarioId: 'stale' });
  assert.equal(fake.calls.length, 0);
  const body = { scenarioId: 'stale', consent: true, prepareId: prepared.body.prepareId, requestId: randomUUID() };
  const [live, duplicate] = await Promise.all([app.request('/api/lens/live-demo', body), app.request('/api/lens/live-demo', body)]);
  assert.equal(live.status, 201); assert.equal(duplicate.status, 201);
  assert.equal(live.body.recording.run.id, duplicate.body.recording.run.id); assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].body.input, prepared.body.context);
  const reused = await app.request('/api/lens/live-demo', { ...body, scenarioId: 'corrected' });
  assert.equal(reused.status, 409);
  const recording = local.body.recording, finding = local.body.assessment.findings[0], checkpoint = recording.events.find(event => event.checkpoint);
  const plan = await app.request('/api/lens/recovery/plan', { recording, findingId: finding.id, checkpointId: checkpoint.id, fresh: false });
  assert.equal(plan.status, 200); assert.equal(plan.body.mode, 'mock-checkpoint');
  const first = await app.request('/api/lens/recovery/execute', { planId: plan.body.id, approved: true });
  const second = await app.request('/api/lens/recovery/execute', { planId: plan.body.id, approved: true });
  assert.equal(first.status, 200); assert.equal(first.body.recording.run.id, second.body.recording.run.id);
  assert.equal(first.body.assessment.findings[0].verdict, 'Supported');
  assert.equal(first.body.comparison.linked, true);
  assert.equal((await app.request('/api/lens/compare', { original: recording, corrected: first.body.recording })).body.changes[0].after, 'Supported');
});
test('HTTP provider errors remain visible, and invalid or unapproved inputs do not call Azure', async t => {
  const fake = fakeClient({ failure: new Error('fixture failure') }), app = await application(t, createFoundryProvider({ env, clientFactory: fake.factory }));
  assert.equal((await app.request('/api/lens/live-demo', { scenarioId: 'stale', consent: false, requestId: randomUUID() })).status, 422);
  assert.equal(fake.calls.length, 0);
  const failed = await app.request('/api/lens/live-demo', { scenarioId: 'stale', consent: true, requestId: randomUUID() });
  assert.equal(failed.status, 502); assert.equal(failed.body.error.code, 'FOUNDRY_REQUEST_FAILED');
  const malformed = createExample(); malformed.events[0].name = 'changed without resealing';
  assert.equal((await app.request('/api/lens/analyze', { recording: malformed })).status, 422);
});
