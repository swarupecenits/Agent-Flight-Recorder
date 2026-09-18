import { randomUUID, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './privacy.mjs';

export class RecordingError extends Error {
  constructor(message, code = 'RECORDING_FAILED') { super(message); this.name = 'RecordingError'; this.code = code; }
}
export const describeError = error => ({
  name: String(error?.name ?? 'Error').slice(0, 160),
  message: String(error?.message ?? error).slice(0, 4000),
  ...(error?.code === undefined ? {} : { code: String(error.code).slice(0, 120) }),
});
class HttpTransport {
  constructor(baseUrl) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Use an HTTP(S) recorder base URL without credentials, query, or fragment.');
    this.baseUrl = url.href.replace(/\/$/, '');
  }
  async request(path, body, writeToken) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AFR-Client': 'sdk', ...(writeToken ? { 'X-AFR-Write-Token': writeToken } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok) throw new RecordingError(result.error?.message ?? `Recorder returned HTTP ${response.status}`, result.error?.code);
    return result;
  }
  createRun(input) { return this.request('/api/capture/runs', input); }
  async append(id, token, event) { return (await this.request(`/api/capture/runs/${id}/events`, { events: [event] }, token)).events[0]; }
  finish(id, token, result) { return this.request(`/api/capture/runs/${id}/finish`, result, token); }
}
class RunRecorder {
  constructor(transport, credentials) {
    this.transport = transport;
    this.id = credentials.runId;
    this.traceId = credentials.traceId;
    this.writeToken = credentials.writeToken;
    this.context = new AsyncLocalStorage();
    this.closed = false;
  }
  async event(type, name, fields = {}) {
    if (this.closed) throw new RecordingError('Cannot append to a finished run.', 'RUN_CLOSED');
    const clean = redact({ id: randomUUID(), timestamp: new Date().toISOString(), type, name,
      parentSpanId: this.context.getStore() ?? null, ...fields });
    return this.transport.append(this.id, this.writeToken, { ...clean.value,
      redactedPaths: [...new Set([...(fields.redactedPaths ?? []), ...clean.paths])] });
  }
  prompt(input) { return this.event('prompt', 'Agent prompt', { input }); }
  decision(note, stateDelta = {}) { return this.event('decision', note, { stateDelta, attributes: { source: 'explicit-agent-annotation', hiddenReasoning: false } }); }
  policy(tool, result, input = null) { return this.event('policy.evaluated', `Policy: ${tool}`, { input, attributes: { tool, ...result } }); }
  output(value) { return this.event('output', 'Agent output', { output: value }); }
  async operation(kind, name, input, fn, options = {}) {
    const attempts = options.attempts ?? 1;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new TypeError('attempts must be an integer between 1 and 5.');
    const retryDelayMs = options.retryDelayMs ?? 30;
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60_000) throw new TypeError('retryDelayMs must be between 0 and 60000.');
    const operationId = randomUUID();
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const spanId = randomBytes(8).toString('hex');
      const attributes = { ...options.attributes, attempt, operationId };
      await this.event(`${kind}.started`, name, { input, spanId, attributes });
      const started = performance.now();
      let value;
      try {
        value = await this.context.run(spanId, fn);
      } catch (error) {
        const durationMs = performance.now() - started;
        await this.event(`${kind}.failed`, name, { input, error: describeError(error), durationMs, spanId, attributes });
        const shouldRetry = attempt < attempts && (!options.retryIf || options.retryIf(error));
        if (!shouldRetry) throw error;
        await this.event('retry', `Retry ${name}`, { attributes: { tool: name, operationId, failedAttempt: attempt,
          nextAttempt: attempt + 1, delayMs: retryDelayMs, reason: describeError(error).message } });
        await delay(retryDelayMs);
        continue;
      }
      // A capture/serialization failure after a successful callback must NEVER retry its side effect.
      const durationMs = performance.now() - started;
      const usage = options.getUsage ? options.getUsage(value) : undefined;
      if (usage !== undefined && (!usage || !Number.isInteger(usage.inputTokens) || usage.inputTokens < 0 ||
          !Number.isInteger(usage.outputTokens) || usage.outputTokens < 0)) throw new TypeError('Measured usage must contain non-negative integer inputTokens and outputTokens.');
      await this.event(`${kind}.completed`, name, { input, output: value === undefined ? null : value, spanId, durationMs,
        attributes: { ...attributes, ...(usage === undefined ? {} : { usage }) } });
      return value;
    }
    throw new Error('Unreachable retry state.');
  }
  tool(name, input, fn, options) { return this.operation('tool', name, input, fn, options); }
  model(name, input, fn, options) { return this.operation('model', name, input, fn, options); }
  async finish(result = {}) {
    if (this.closed) throw new RecordingError('The run is already finished.', 'RUN_CLOSED');
    const clean = redact(result);
    const run = await this.transport.finish(this.id, this.writeToken, { ...clean.value, redactedPaths: clean.paths });
    this.closed = true;
    return run;
  }
}
export class FlightRecorder {
  constructor({ baseUrl = 'http://127.0.0.1:4180', transport } = {}) { this.transport = transport ?? new HttpTransport(baseUrl); }
  async startRun(input) {
    const clean = redact(input);
    return this.resume(await this.transport.createRun({ ...clean.value, redactedPaths: clean.paths }));
  }
  resume(credentials) { return new RunRecorder(this.transport, credentials); }
  async run(input, fn) {
    const run = await this.startRun(input);
    try {
      const result = await fn(run);
      if (!run.closed) await run.finish({ status: 'completed', output: result === undefined ? null : result });
      return result;
    }
    catch (error) {
      if (run.closed) throw error;
      try { await run.finish({ status: 'failed', error: describeError(error) }); }
      catch (recordingError) { throw new AggregateError([error, recordingError], 'The agent failed and its terminal recording also failed.'); }
      throw error;
    }
  }
}
