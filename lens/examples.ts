import { strictEqual } from 'node:assert';
import { addEvent, hash, newRecording, seal, validateRecording } from './schema.ts';
import type { Checkpoint, LensRecording, Scope } from './types.ts';
import { exampleScenarios, type ExampleId } from './catalog.ts';
export { exampleScenarios } from './catalog.ts';
export type { ExampleId } from './catalog.ts';
const implementations = {
  A: function add(a: number, b: number) { return a + b; },
  B: function add(left: number, right: number) { return [left, right].reduce((sum, value) => sum + value, 0); },
  broken: function add(a: number, b: number) { return a - b; },
};
export const revisions = { A: implementations.A.toString(), B: implementations.B.toString(), broken: implementations.broken.toString() };
export function supportedCheckpoint(checkpoint: Checkpoint | undefined): boolean {
  return Boolean(checkpoint && checkpoint.harness === 'lens-mock' && checkpoint.version === 1 &&
    checkpoint.state.fixture === 'addition-v1' && Object.hasOwn(revisions, checkpoint.state.revision) &&
    checkpoint.state.environment === 'sandbox' && hash(checkpoint.state) === checkpoint.stateHash);
}
export function createExample(scenarioId: ExampleId = 'stale', options: {
  parentRunId?: string; checkpointId?: string; checkpoint?: Checkpoint; correction?: string;
} = {}): LensRecording {
  const scenario = exampleScenarios.find(item => item.id === scenarioId);
  if (!scenario) throw new Error('Unknown Evidence Lens example.');
  if (options.checkpoint && !supportedCheckpoint(options.checkpoint)) throw new Error('The mock checkpoint is incompatible. No live tool fallback is permitted.');
  const recording = newRecording(scenario.name, 'synthetic-evidence-harness', 'mock');
  recording.run.parentRunId = options.parentRunId ?? null;
  recording.provenance.restartedFrom = options.checkpointId ?? null;
  recording.sources = [{ id: 'lens-mock', version: '1', status: 'capturing',
    detail: 'Explicit synthetic harness. Unit assertions execute locally; health responses are fixed mocks. No live tools or external writes are available.',
    capabilities: ['in-memory-validation', 'mock-checkpoint', 'mock-fresh-run'] }];
  recording.gaps.push({ code: 'SYNTHETIC_SOURCE', detail: 'Synthetic demonstration, not evidence about your actual repository or cloud resources.' });
  let revision: keyof typeof revisions = options.checkpoint ? options.checkpoint.state.revision as keyof typeof revisions
    : scenarioId === 'contradiction' ? 'broken' : scenarioId === 'corrected' ? 'B' : 'A';
  if (options.correction) revision = 'B';
  const scope: Scope = { repositoryId: 'demo:atlas-api', codeVersion: hash(revisions[revision]), suite: 'unit' };
  recording.finalScope = { ...scope };
  const start = addEvent(recording, { type: 'run.started', name: options.checkpoint ? 'Restore the compatible mock checkpoint into a new run' : 'Start the isolated synthetic harness', scope });
  recording.inventory = [
    { kind: 'agent', id: 'synthetic-evidence-harness', name: 'Evidence demo harness', version: '1', available: true, usedBy: [start.id] },
    { kind: 'skill', id: 'validation-skill', name: 'Run validation after the final change', version: '1', available: true, usedBy: [] },
    { kind: 'skill', id: 'deployment-skill', name: 'Unavailable deployment capability', version: null, available: false, usedBy: [] },
    { kind: 'instruction', id: 'scope-rule', name: 'Bind claims to an exact target', version: '1', available: true, usedBy: [] },
    { kind: 'repository', id: 'demo:atlas-api', name: 'Fictional atlas-api', version: scope.codeVersion!, available: true, usedBy: [start.id] },
    { kind: 'mcp-server', id: 'mock-health-server', name: 'Mock health observations only', version: '1', available: true, usedBy: [] },
    { kind: 'tool', id: 'unit-harness', name: 'In-memory unit assertions', version: '1', available: true, usedBy: [] },
  ];
  const state = { fixture: 'addition-v1', revision, environment: 'sandbox' };
  addEvent(recording, { type: 'checkpoint', name: 'Compatible mock boundary before validation', scope, parents: [start.id],
    checkpoint: { harness: 'lens-mock', version: 1, boundary: 'Before the first unit assertion; state is only the versioned in-memory fixture.', state, stateHash: hash(state) } });
  if (scenarioId === 'scope' || scenarioId === 'denied') {
    const observedScope: Scope = { resourceId: 'demo:service/staging', environment: 'staging', queryScope: 'health/read' };
    const finalScope: Scope = scenarioId === 'scope'
      ? { resourceId: 'demo:service/production', environment: 'production', queryScope: 'health/read' } : observedScope;
    recording.finalScope = finalScope;
    const response = addEvent(recording, { type: 'tool.result', name: scenarioId === 'scope' ? 'Mock staging health response' : 'Mock health query denied',
      scope: observedScope, assetIds: ['mock-health-server', 'scope-rule'], observation: { kind: 'health', outcome: scenarioId === 'scope' ? 'healthy' : 'denied' } });
    addEvent(recording, { type: 'claim', name: 'Final service-health claim', scope: finalScope, parents: [response.id],
      claim: { kind: 'health', text: 'The service is healthy.', evidenceIds: [response.id], appliesTo: 'final' } });
  } else {
    let passed = 0, failed = 0;
    for (const [left, right, expected] of [[1, 2, 3], [0, 4, 4], [-2, 3, 1]]) {
      try { strictEqual(implementations[revision](left, right), expected); passed++; }
      catch (error) { if (!(error instanceof Error) || error.name !== 'AssertionError') throw error; failed++; }
    }
    const result = addEvent(recording, { type: 'tool.result', name: 'Unit assertions completed', scope,
      assetIds: ['unit-harness', 'validation-skill', 'demo:atlas-api'],
      observation: { kind: 'test', outcome: failed ? 'failed' : 'passed', exitCode: failed ? 1 : 0, passed, failed } });
    if (scenarioId === 'stale') {
      recording.finalScope = { ...scope, codeVersion: hash(revisions.B) };
      addEvent(recording, { type: 'context.snapshot', name: 'Code changed from A to B after validation', scope: recording.finalScope, parents: [result.id], assetIds: ['demo:atlas-api'] });
    }
    addEvent(recording, { type: 'claim', name: 'Final validation claim', scope: recording.finalScope, parents: [result.id],
      claim: { kind: 'test', text: 'The final change passes the unit tests.', evidenceIds: [result.id], appliesTo: 'final' } });
  }
  addEvent(recording, { type: 'run.finished', name: 'Harness finished; evidence still requires assessment', scope: recording.finalScope });
  recording.run.status = 'completed';
  recording.run.endedAt = new Date().toISOString();
  return validateRecording(seal(recording));
}
