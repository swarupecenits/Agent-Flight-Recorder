import { z } from 'zod';
import { importRecording, adapterHealth } from '../lens/adapters.ts';
import { assess, compareEvidence } from '../lens/engine.ts';
import { createExample, exampleScenarios } from '../lens/examples.ts';
import { addEvent, hash, seal, validateRecording } from '../lens/schema.ts';
import { modelContext } from '../lens/model-context.ts';
import { executeMockRecovery, planRecovery } from '../lens/recovery.ts';
import { createFoundryProvider } from './foundry.mjs';
import { HttpError } from './schemas.mjs';
import { randomUUID } from 'node:crypto';

const scenarioSchema = z.enum(exampleScenarios.map(item => item.id));
const recordingBody = z.object({ recording: z.unknown(), captureContent: z.boolean().default(false) }).strict();
export function prepareLiveEvidenceDemo(scenarioId) {
  const recording = createExample(scenarioId);
  recording.events.pop();
  recording.run.endedAt = null;
  recording.run.status = 'running';
  recording.run.name = `Live Azure evidence review: ${scenarioId}`;
  recording.adapter = { id: 'foundry-evidence-demo', version: 1, mode: 'live' };
  recording.contentCapture = 'minimized';
  recording.sources.push({ id: 'azure-responses', version: 'v1', status: 'capturing',
    detail: 'Real streaming model request. Only synthetic evidence metadata is sent. Model prose is advisory and cannot overwrite deterministic verdicts.',
    capabilities: ['streamed-model-response', 'measured-token-usage'] });
  const start = addEvent(recording, { type: 'tool.started', name: 'Live Azure Responses evidence review', scope: recording.finalScope, assetIds: ['azure-model'] });
  recording.inventory.push({ kind: 'agent', id: 'azure-model', name: 'Configured Azure deployment', version: null, available: true, usedBy: [start.id] });
  return validateRecording(seal(recording));
}
export async function createLiveEvidenceDemo(provider, scenarioId, consent, signal, prepared) {
  const recording = prepared ? structuredClone(validateRecording(prepared)) : prepareLiveEvidenceDemo(scenarioId);
  const start = recording.events.at(-1);
  const draft = await provider.review(modelContext(seal(recording)), { consent, signal });
  const result = addEvent(recording, { type: 'tool.result', name: 'Azure completed a real streamed response', scope: recording.finalScope, parents: [start.id],
    assetIds: ['azure-model'], observation: { kind: 'action', outcome: 'succeeded' },
    model: { deployment: draft.deployment, model: draft.model, responseId: draft.responseId, durationMs: draft.durationMs, streamedDeltas: draft.streamedDeltas, usage: draft.usage } });
  recording.inventory = recording.inventory.filter(item => item.id !== 'azure-model');
  recording.inventory.push({ kind: 'agent', id: 'azure-model', name: draft.deployment, version: draft.model, available: true, usedBy: [start.id, result.id] });
  addEvent(recording, { type: 'run.finished', name: 'Live review complete; draft awaits human judgment', scope: recording.finalScope, parents: [result.id] });
  recording.run.status = 'completed';
  recording.run.endedAt = new Date().toISOString();
  const finished = validateRecording(seal(recording));
  return { recording: finished, assessment: assess(finished), draft };
}
export function mountLens(app, store, { provider = createFoundryProvider() } = {}) {
  const requests = new Map();
  const plans = new Map();
  const prepared = new Map();
  function read(body) {
    try { return importRecording(body.recording, body.captureContent); }
    catch (error) { throw new HttpError(422, 'INVALID_EVIDENCE_RECORDING', error.message); }
  }
  function once(key, fingerprint, callback) {
    if (requests.has(key)) {
      const existing = requests.get(key);
      if (existing.fingerprint !== fingerprint) throw new HttpError(409, 'REQUEST_ID_CONFLICT', 'This request ID was already used for a different reviewed operation.');
      return existing.promise;
    }
    if (requests.size >= 32) throw new HttpError(429, 'LIVE_SESSION_LIMIT', 'The 32-request session limit is reached. No further model request was sent.');
    const promise = Promise.resolve().then(callback);
    requests.set(key, { fingerprint, promise });
    return promise;
  }
  app.get('/api/lens/status', (req, res) => res.json({ provider: provider.status(), adapters: adapterHealth, scenarios: exampleScenarios,
    persistence: 'The web Lens is memory-only. Use the VS Code companion for encrypted persistent records. Legacy recorder SQLite remains plaintext.' }));
  app.get('/api/runs/:id/evidence', (req, res) => {
    const recording = importRecording(store.exportRecording(req.params.id));
    res.json({ recording, assessment: assess(recording) });
  });
  app.post('/api/lens/analyze', (req, res) => {
    const recording = read(recordingBody.parse(req.body));
    res.json({ recording, assessment: assess(recording) });
  });
  app.post('/api/lens/example', (req, res) => {
    const { scenarioId } = z.object({ scenarioId: scenarioSchema }).strict().parse(req.body);
    const recording = createExample(scenarioId);
    res.json({ recording, assessment: assess(recording) });
  });
  app.post('/api/lens/live-demo/prepare', (req, res) => {
    const { scenarioId } = z.object({ scenarioId: scenarioSchema }).strict().parse(req.body);
    if (prepared.size >= 32) throw new HttpError(429, 'PREVIEW_LIMIT', 'The 32-preview session limit is reached. No model request was sent.');
    const prepareId = randomUUID();
    const recording = prepareLiveEvidenceDemo(scenarioId);
    prepared.set(prepareId, { recording, scenarioId });
    res.json({ prepareId, context: modelContext(recording), endpoint: provider.status().endpoint });
  });
  app.post('/api/lens/model-context', (req, res) => {
    const recording = read(recordingBody.parse(req.body));
    res.json({ context: modelContext(recording), endpoint: provider.status().endpoint });
  });
  app.post('/api/lens/live-demo', async (req, res) => {
    const body = z.object({ scenarioId: scenarioSchema.default('stale'), consent: z.literal(true), requestId: z.uuid(), prepareId: z.uuid().optional() }).strict().parse(req.body);
    res.status(201).json(await once(body.requestId, hash({ method: 'live-demo', scenarioId: body.scenarioId, prepareId: body.prepareId ?? null }), () => {
      const preview = body.prepareId ? prepared.get(body.prepareId) : null;
      if (body.prepareId && (!preview || preview.scenarioId !== body.scenarioId)) throw new HttpError(409, 'PREVIEW_CHANGED', 'Prepare and review the exact synthetic request again.');
      return createLiveEvidenceDemo(provider, body.scenarioId, body.consent, undefined, preview?.recording);
    }));
  });
  app.post('/api/lens/model-review', async (req, res) => {
    const body = z.object({ recording: z.unknown(), consent: z.literal(true), requestId: z.uuid() }).strict().parse(req.body);
    const recording = read({ recording: body.recording, captureContent: false });
    res.json(await once(body.requestId, hash({ method: 'model-review', digest: recording.integrity.digest }), () => provider.review(modelContext(recording), { consent: body.consent })));
  });
  app.post('/api/lens/compare', (req, res) => {
    const body = z.object({ original: z.unknown(), corrected: z.unknown() }).strict().parse(req.body);
    res.json(compareEvidence(read({ recording: body.original }), read({ recording: body.corrected })));
  });
  app.post('/api/lens/recovery/plan', (req, res) => {
    const body = z.object({ recording: z.unknown(), findingId: z.string().max(180), checkpointId: z.string().max(160).nullable(), fresh: z.boolean() }).strict().parse(req.body);
    if (plans.size >= 100) throw new HttpError(429, 'PLAN_LIMIT', 'The recovery-plan session limit is reached.');
    const recording = read({ recording: body.recording, captureContent: false });
    let plan;
    try { plan = planRecovery(recording, body.findingId, body.checkpointId, body.fresh); }
    catch (error) { throw new HttpError(422, 'INVALID_RECOVERY_PLAN', error.message); }
    plans.set(plan.id, { plan, recording, result: null });
    res.json(plan);
  });
  app.post('/api/lens/recovery/execute', (req, res) => {
    const body = z.object({ planId: z.uuid(), approved: z.literal(true) }).strict().parse(req.body);
    const state = plans.get(body.planId);
    if (!state) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Create and review a recovery plan first.');
    if (!state.plan.executable) throw new HttpError(409, 'HANDOFF_ONLY', 'This source supports a handoff only; no exact runtime resume or live fallback is available.');
    if (!state.result) {
      const recording = executeMockRecovery(state.recording, state.plan, body.planId);
      state.result = { recording, assessment: assess(recording), comparison: compareEvidence(state.recording, recording) };
    }
    res.json(state.result);
  });
}
