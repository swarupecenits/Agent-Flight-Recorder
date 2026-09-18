import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { FlightRecorder } from '../sdk/recorder.mjs';
import { hash } from '../lens/schema.ts';
import { loadLocalEnvironment } from '../server/environment.mjs';

loadLocalEnvironment();
const baseUrl = process.env.AFR_URL ?? `http://127.0.0.1:${process.env.AFR_PORT ?? 4180}`;
const recorder = new FlightRecorder({ baseUrl });
const addA = (left, right) => left + right;
const addB = (left, right) => [left, right].reduce((sum, value) => sum + value, 0);
const scope = fn => ({ repositoryId: 'demo:native-sdk-fixture', codeVersion: hash(fn.toString()), suite: 'unit' });
const views = [];
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
for (const fresh of [false, true]) {
  const finalScope = scope(addB);
  let runId;
  await recorder.run({
    name: fresh ? 'SDK evidence - final version checked' : 'SDK evidence - code changed after the check',
    agentName: 'evidence-sdk-example', metadata: { fictionalData: true, evidenceLens: { version: 1, finalScope, inventory: [
      { kind: 'tool', id: 'unit-harness', name: 'Real in-memory unit assertions', version: '1', available: true, usedBy: [] },
    ] } },
  }, async run => {
    runId = run.id;
    let implementation = fresh ? addB : addA;
    const observedScope = scope(implementation);
    const evidence = await run.tool('ValidateAddition', { scope: observedScope }, async () => {
      let passed = 0, failed = 0;
      for (const [a, b, expected] of [[1, 2, 3], [0, 4, 4], [-2, 3, 1]]) {
        try { assert.equal(implementation(a, b), expected); passed++; }
        catch (error) { if (!(error instanceof assert.AssertionError)) throw error; failed++; }
      }
      const observation = { kind: 'test', outcome: failed ? 'failed' : 'passed', exitCode: failed ? 1 : 0, passed, failed };
      const event = await run.event('decision', 'Observed unit validation result', { output: observation,
        attributes: { lens: { version: 1, scope: observedScope, observation, assetIds: ['unit-harness'] } } });
      return { evidenceId: event.id, observation };
    });
    implementation = addB;
    await run.event('decision', 'Final code-version snapshot', { attributes: { lens: { version: 1, scope: scope(implementation), contextSnapshot: true } } });
    await run.event('decision', 'Final validation claim', { attributes: { lens: { version: 1, scope: finalScope,
      claim: { kind: 'test', text: 'The final fixture passes the unit tests.', appliesTo: 'final', evidenceIds: [evidence.evidenceId] } } } });
    return { fixture: 'synthetic-addition', validatedVersion: observedScope.codeVersion, deliveredVersion: finalScope.codeVersion };
  });
  const exported = await fetch(`${baseUrl}/api/runs/${runId}/export?format=json`);
  if (!exported.ok) throw new Error(`Native SDK export failed (HTTP ${exported.status}).`);
  const name = fresh ? 'sdk-evidence-supported.json' : 'sdk-evidence-stale.json';
  await writeFile(new URL(`../artifacts/${name}`, import.meta.url), await exported.text());
  const evaluated = await fetch(`${baseUrl}/api/runs/${runId}/evidence`);
  if (!evaluated.ok) throw new Error(`Evidence evaluation failed (HTTP ${evaluated.status}).`);
  const { assessment } = await evaluated.json();
  const expected = fresh ? 'Supported' : 'Unverifiable';
  assert.equal(assessment.findings[0].verdict, expected);
  views.push({ runId, verdict: expected, recorder: `${baseUrl}/#/runs/${runId}`, evidence: `${baseUrl}/#/evidence?run=${runId}`, file: `artifacts\\${name}` });
}
console.log(JSON.stringify({ syntheticFixtures: true, modelCalls: 0, recordings: views }, null, 2));
