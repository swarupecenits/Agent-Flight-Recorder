import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createExample } from '../lens/examples.ts';
import { assess, compareEvidence } from '../lens/engine.ts';
import { addEvent, hash, newRecording, seal, validateRecording } from '../lens/schema.ts';
import { importRecording, protectRecording } from '../lens/adapters.ts';
import { planRecovery, executeMockRecovery } from '../lens/recovery.ts';
import { EncryptedVault } from '../lens/vault.ts';
import { snapshotWorkspace } from '../lens/workspace.ts';
import { modelContext } from '../lens/model-context.ts';
import { Store } from '../server/store.mjs';

const exec = promisify(execFile);
const claim = recording => recording.events.find(event => event.claim);
const result = recording => recording.events.find(event => event.observation);
const evaluate = recording => assess(seal(recording)).findings[0];
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'afr-lens-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

for (const [scenario, verdict, code] of [
  ['stale', 'Unverifiable', 'STALE_VALIDATION'],
  ['contradiction', 'Contradicted', 'TEST_RESULT_CONTRADICTION'],
  ['scope', 'Unverifiable', 'SCOPE_MISMATCH'],
  ['denied', 'Unverifiable', 'RESULT_UNAVAILABLE'],
  ['corrected', 'Supported', 'MATCHING_CAPTURED_EVIDENCE'],
]) {
  test(`Lens ${scenario}: ${verdict}, not an invented execution result`, () => {
    const recording = createExample(scenario);
    const finding = evaluate(recording);
    assert.equal(finding.verdict, verdict);
    assert.equal(finding.reasonCode, code);
    if (scenario === 'stale') assert.match(finding.explanation, /does not prove.*broken/);
    assert.equal(recording.run.synthetic, true);
  });
}
test('an explicitly stale final claim does not become supported by matching older evidence', () => {
  const recording = createExample('stale');
  claim(recording).scope = { ...result(recording).scope };
  assert.equal(evaluate(recording).reasonCode, 'STALE_CLAIM_VERSION');
});
test('missing versions and missing links remain distinct and visible', () => {
  const recording = createExample('corrected');
  delete result(recording).scope.codeVersion;
  assert.equal(evaluate(recording).reasonCode, 'MISSING_SCOPE_OR_VERSION');
  claim(recording).claim.evidenceIds = [];
  assert.equal(evaluate(recording).verdict, 'Unsupported');
  claim(recording).claim.evidenceIds = ['missing-result'];
  assert.equal(evaluate(recording).reasonCode, 'MISSING_EVIDENCE_LINK');
});
test('noncausal and wrong-kind evidence cannot establish a claim', () => {
  const recording = createExample('corrected');
  claim(recording).claim.evidenceIds = [recording.events.at(-1).id];
  assert.equal(evaluate(recording).reasonCode, 'NONCAUSAL_EVIDENCE');
  claim(recording).claim.evidenceIds = [recording.events[0].id];
  assert.equal(evaluate(recording).reasonCode, 'WRONG_EVIDENCE_KIND');
});
test('a final test claim does not inherit unrelated resource-health scope', () => {
  const recording = createExample('corrected');
  recording.finalScope.resourceId = 'unrelated-health-resource';
  recording.finalScope.queryScope = 'health-query';
  assert.equal(evaluate(recording).verdict, 'Supported');
});
test('the latest applicable explicitly linked result is used, not an unrelated environment', () => {
  const recording = createExample('corrected');
  const first = result(recording);
  const finalClaim = claim(recording);
  const additional = { ...structuredClone(first), id: randomUUID(), seq: first.seq + 1,
    scope: { ...first.scope, repositoryId: 'demo:different-repository' } };
  recording.events.splice(first.seq, 0, additional);
  recording.events.forEach((event, index) => { event.seq = index + 1; });
  finalClaim.claim.evidenceIds.push(additional.id);
  assert.equal(evaluate(recording).verdict, 'Supported');
  additional.scope = { ...first.scope };
  additional.observation = { kind: 'test', outcome: 'failed', exitCode: 1, passed: 1, failed: 2 };
  assert.equal(evaluate(recording).verdict, 'Contradicted');
});
test('an observation-linked capture gap prevents false support', () => {
  const recording = createExample('corrected');
  recording.gaps.push({ code: 'READ_INTERRUPTED', detail: 'The result capture was interrupted.', eventId: result(recording).id });
  assert.equal(evaluate(recording).reasonCode, 'RELEVANT_CAPTURE_GAP');
});
test('incompatible outcomes and missing process status are not successful validation', () => {
  const recording = createExample('corrected');
  result(recording).observation.outcome = 'healthy';
  assert.equal(evaluate(recording).reasonCode, 'INCOMPATIBLE_RESULT');
  result(recording).observation.outcome = 'passed';
  delete result(recording).observation.exitCode;
  assert.equal(evaluate(recording).reasonCode, 'MISSING_TEST_RESULT');
});
test('exact citation fidelity requires the captured source, digest and consented content', () => {
  const recording = newRecording('Citation case', 'citation-fixture', 'mock');
  recording.contentCapture = 'included';
  addEvent(recording, { type: 'run.started', name: 'Start citation fixture' });
  const excerpt = 'The test harness uses a local sandbox.';
  const evidence = addEvent(recording, { type: 'tool.result', name: 'Read the fictional source',
    observation: { kind: 'citation', outcome: 'succeeded', sourceId: 'synthetic:guide', sourceVersion: '1', excerpt, excerptHash: hash(excerpt) } });
  addEvent(recording, { type: 'claim', name: 'Citation fidelity', claim: { kind: 'citation', text: 'The source contains the supplied quotation.',
    appliesTo: 'captured', evidenceIds: [evidence.id], quote: 'local sandbox' } });
  assert.equal(evaluate(recording).verdict, 'Supported');
  assert.equal(assess(protectRecording(seal(recording), false)).findings[0].reasonCode, 'CITATION_CONTENT_UNAVAILABLE');
  claim(recording).claim.quote = 'a production deployment';
  assert.equal(evaluate(recording).reasonCode, 'QUOTE_NOT_IN_EXCERPT');
  result(recording).observation.excerptHash = '0'.repeat(64);
  assert.equal(evaluate(recording).reasonCode, 'CITATION_DIGEST_MISMATCH');
});
test('integrity, causal parents, duplicate IDs and adapter versions are enforced', () => {
  const recording = createExample();
  recording.events[0].name = 'tampered';
  assert.throws(() => validateRecording(recording), /integrity mismatch/);
  recording.events[1].parents = [recording.events.at(-1).id];
  assert.throws(() => validateRecording(seal(recording)), /earlier/);
  recording.events[1].parents = [];
  recording.events[1].id = recording.events[0].id;
  assert.throws(() => validateRecording(seal(recording)), /IDs or sequence/);
  assert.throws(() => importRecording({ format: 'unknown-tool', version: 9 }), /Unsupported/);
});
test('manifest distinguishes available, used and missing-version inventory', () => {
  const recording = createExample('corrected');
  const analysis = assess(recording);
  assert.ok(analysis.manifest.find(item => item.id === 'unit-harness').usedBy.length);
  assert.equal(analysis.manifest.find(item => item.id === 'mock-health-server').usedBy.length, 0);
  assert.equal(analysis.manifest.find(item => item.id === 'deployment-skill').available, false);
  recording.inventory.push({ kind: 'instruction', id: 'external-policy', name: 'Uncaptured policy', version: null, available: true, usedBy: ['missing-use'] });
  assert.ok(assess(seal(recording)).gaps.some(gap => gap.code === 'INVENTORY_CAPTURE_GAP'));
});
test('handoff retains unresolved claims, version requirements, evidence links and limits', () => {
  const analysis = assess(createExample('stale'));
  assert.match(analysis.summary, /Unverifiable/);
  assert.match(analysis.summary, /Rerun validation against the final code version/);
  assert.match(analysis.summary, new RegExp(analysis.findings[0].evidenceIds[0]));
  for (const link of analysis.summary.matchAll(/\]\(#([^)]+)\)/g)) {
    assert.ok(analysis.summary.includes(`id="${link[1]}"`), `Missing summary anchor: ${link[1]}`);
  }
  assert.match(analysis.summary, /No hidden reasoning/);
});
test('minimization and redaction derive a new digest while retaining source provenance', () => {
  const recording = createExample('corrected');
  recording.contentCapture = 'included';
  recording.events[0].content = { input: { password: 'private-fixture-password' }, output: 'Bearer fixture-credential-should-not-remain' };
  const source = seal(recording);
  const minimized = importRecording(source);
  assert.equal(minimized.contentCapture, 'minimized');
  assert.equal(minimized.events[0].content, undefined);
  assert.equal(minimized.provenance.sourceRootHash, source.integrity.digest);
  const included = importRecording(source, true);
  assert.equal(included.events[0].content.input.password, '[REDACTED]');
  assert.ok(!JSON.stringify(included).includes('fixture-credential-should-not-remain'));
  assert.notEqual(included.integrity.digest, source.integrity.digest);
});
test('native SDK evidence annotations round-trip through the existing verified format', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const scope = { repositoryId: 'demo:external-sdk', codeVersion: 'version-B', suite: 'unit' };
  const credentials = store.createRun({ name: 'Versioned SDK capture', agentName: 'test-agent',
    metadata: { fictionalData: true, evidenceLens: { version: 1, finalScope: scope, inventory: [
      { kind: 'agent', id: 'test-agent', name: 'Test agent', available: true, version: '1', usedBy: [] },
    ] } } });
  const [evidence] = store.capture(credentials.runId, credentials.writeToken, [{ type: 'tool.completed', name: 'Unit tests',
    attributes: { lens: { version: 1, scope, observation: { kind: 'test', outcome: 'passed', exitCode: 0, passed: 3, failed: 0 } } } }]);
  store.capture(credentials.runId, credentials.writeToken, [{ type: 'decision', name: 'Final claim', attributes: { lens: {
    version: 1, scope, claim: { kind: 'test', text: 'The captured tests passed for version B.', appliesTo: 'final', evidenceIds: [evidence.id] },
  } } }]);
  store.finish(credentials.runId, credentials.writeToken, { status: 'completed' });
  const native = store.exportRecording(credentials.runId);
  const imported = importRecording(native);
  assert.equal(assess(imported).findings[0].verdict, 'Supported');
  assert.equal(imported.run.synthetic, true);
  assert.equal(imported.provenance.sourceRootHash, native.rootHash);
  assert.equal(imported.inventory.filter(item => item.id === 'test-agent').length, 1);
  native.status = 'failed';
  assert.throws(() => importRecording(native), /lifecycle/);
  native.status = 'completed'; native.events[1].output = 'modified';
  assert.throws(() => importRecording(native), /chain/);
});
test('legacy native recordings retain gaps rather than inventing structured claims', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const credentials = store.createRun({ name: 'Plain source recording', agentName: 'legacy-agent' });
  store.finish(credentials.runId, credentials.writeToken, { status: 'blocked' });
  const imported = importRecording(store.exportRecording(credentials.runId));
  assert.equal(imported.run.status, 'blocked');
  assert.equal(imported.run.synthetic, false);
  assert.equal(assess(imported).findings.length, 0);
  assert.ok(assess(imported).gaps.some(gap => gap.code === 'NO_STRUCTURED_CLAIMS'));
});
test('compatible recovery starts before the relevant action and never changes the original', () => {
  const original = createExample('stale'), digest = original.integrity.digest;
  const analysis = assess(original), checkpoint = original.events.find(event => event.checkpoint);
  const plan = planRecovery(original, analysis.findings[0].id, checkpoint.id, false);
  assert.equal(plan.executable, true);
  assert.equal(plan.mode, 'mock-checkpoint');
  assert.ok(checkpoint.seq < result(original).seq && result(original).seq < claim(original).seq);
  assert.throws(() => executeMockRecovery(original, plan, randomUUID()), /explicit approval/);
  const corrected = executeMockRecovery(original, plan, plan.id);
  assert.equal(original.integrity.digest, digest);
  assert.equal(corrected.run.parentRunId, original.run.id);
  assert.equal(corrected.provenance.restartedFrom, checkpoint.id);
  assert.equal(assess(corrected).findings[0].verdict, 'Supported');
  assert.deepEqual(compareEvidence(original, corrected).changes.map(item => [item.before, item.after]), [['Unverifiable', 'Supported']]);
});
test('a timeline label, incompatible state, or external runtime yields a handoff, never live fallback', () => {
  const original = createExample('stale');
  const finding = assess(original).findings[0];
  assert.equal(planRecovery(original, finding.id, claim(original).id, false).mode, 'handoff');
  original.run.synthetic = false; original.adapter.id = 'external-runtime'; original.adapter.mode = 'import';
  const external = seal(original);
  const plan = planRecovery(external, finding.id, external.events.find(event => event.checkpoint).id, false);
  assert.equal(plan.executable, false);
  assert.throws(() => executeMockRecovery(external, plan, plan.id), /Unsupported execution capability/);
});
test('fresh recovery is explicitly labeled and stale reviewed plans are rejected', () => {
  const original = createExample('stale');
  const plan = planRecovery(original, assess(original).findings[0].id, null, true);
  assert.equal(plan.mode, 'mock-fresh'); assert.match(plan.restartBoundary, /not exact/);
  original.run.name = 'Changed after review';
  assert.throws(() => executeMockRecovery(seal(original), plan, plan.id), /changed after/);
});
test('model context excludes raw inputs, source excerpts and review artifacts', () => {
  const recording = createExample('stale');
  recording.events[0].content = { input: 'PRIVATE_RAW_INPUT', output: 'PRIVATE_RAW_OUTPUT' };
  result(recording).observation.excerpt = 'PRIVATE_SOURCE_EXCERPT';
  const context = modelContext(seal(recording));
  assert.ok(!context.includes('PRIVATE_'));
  assert.match(context, /Unverifiable/);
  assert.ok(Buffer.byteLength(context) <= 24000);
});
test('encrypted vault protects records and artifacts and survives process-style re-opening', async t => {
  const directory = await temporary(t), key = randomBytes(32);
  const recording = createExample('stale');
  recording.run.name = 'PRIVATE_RECORD_TITLE';
  const vault = new EncryptedVault(directory, key); await vault.initialize();
  await vault.save(seal(recording));
  await assert.rejects(vault.addArtifact(recording.run.id, 'unsupported-kind', 'Invalid draft', 'Not persisted'));
  assert.equal((await vault.read(recording.run.id)).artifacts.length, 0);
  await vault.addArtifact(recording.run.id, 'correction', 'PRIVATE_DRAFT_TITLE', 'PRIVATE_DRAFT_CONTENT');
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const bytes = await readFile(join(directory, files[0]), 'utf8');
  assert.ok(!bytes.includes('PRIVATE_'));
  vault.dispose();
  const reopened = new EncryptedVault(directory, key);
  const stored = await reopened.read(recording.run.id);
  assert.equal(stored.recording.run.name, 'PRIVATE_RECORD_TITLE');
  assert.equal(stored.artifacts[0].text, 'PRIVATE_DRAFT_CONTENT');
  assert.equal((await reopened.save(stored.recording)).duplicate, true);
  stored.recording.run.name = 'DIFFERENT_CONTENT';
  await assert.rejects(reopened.save(seal(stored.recording)), /not overwritten/);
  reopened.dispose();
});
test('wrong keys, ciphertext tampering, invalid IDs and unapproved retention deletion fail closed', async t => {
  const directory = await temporary(t), key = randomBytes(32), recording = createExample('corrected');
  const vault = new EncryptedVault(directory, key); await vault.initialize(); await vault.save(recording);
  await assert.rejects(new EncryptedVault(directory, randomBytes(32)).read(recording.run.id), /Decryption or authentication failed/);
  await assert.rejects(vault.read('..\\outside'), /Invalid/);
  const expired = await vault.expired(1, Date.now() + 2 * 86400000);
  assert.deepEqual(expired, [recording.run.id]);
  await assert.rejects(vault.purge(expired, []), /exact expired-record list/);
  const path = join(directory, `${recording.run.id}.lens.enc`);
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  const originalTag = envelope.tag;
  envelope.tag = Buffer.from(originalTag, 'base64').subarray(0, 4).toString('base64');
  await writeFile(path, JSON.stringify(envelope));
  await assert.rejects(vault.read(recording.run.id), /truncated authentication tag/);
  envelope.tag = randomBytes(16).toString('base64');
  await writeFile(path, JSON.stringify(envelope));
  await assert.rejects(vault.read(recording.run.id), /Decryption or authentication failed/);
  vault.dispose();
});
test('approved retention removes only the named encrypted record', async t => {
  const directory = await temporary(t), vault = new EncryptedVault(directory, randomBytes(32));
  await vault.initialize();
  const first = createExample('stale'), second = createExample('corrected');
  await vault.save(first); await vault.save(second);
  await vault.purge([first.run.id], [first.run.id]);
  assert.deepEqual((await vault.list()).map(item => item.id), [second.run.id]);
  vault.dispose();
});
test('workspace fingerprints detect edits, omit credential content and refuse unsaved-buffer claims', async t => {
  const directory = await temporary(t);
  await exec('git', ['init', '--quiet', directory], { windowsHide: true });
  await writeFile(join(directory, 'source.js'), 'export const value = 1;\n');
  await writeFile(join(directory, '.env'), 'PRIVATE_FIXTURE_VALUE=one\n');
  const first = await snapshotWorkspace(directory);
  assert.ok(first.scope.codeVersion);
  assert.equal(first.fileCount, 1);
  await writeFile(join(directory, '.env'), 'PRIVATE_FIXTURE_VALUE=two\n');
  assert.equal((await snapshotWorkspace(directory)).scope.codeVersion, first.scope.codeVersion);
  await writeFile(join(directory, 'source.js'), 'export const value = 2;\n');
  assert.notEqual((await snapshotWorkspace(directory)).scope.codeVersion, first.scope.codeVersion);
  const unsaved = await snapshotWorkspace(directory, ['synthetic-unsaved-buffer']);
  assert.equal(unsaved.scope.codeVersion, undefined);
  assert.ok(unsaved.gaps.some(gap => gap.code === 'UNSAVED_BUFFERS'));
});
