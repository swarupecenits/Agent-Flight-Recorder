import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from './store.mjs';
import { DemoRunner, scenarios, policies } from './demo.mjs';
import { replay } from '../shared/trace.mjs';
import { compareRuns, markdownReport, otlpExport } from './exports.mjs';
import { HttpError, createRunSchema, batchSchema, finishSchema, demoSchema, approvalSchema } from './schemas.mjs';
import { mountMcp } from './mcp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
function boundary(development) {
  return (req, res, next) => {
    const host = req.headers.host;
    let hostUrl;
    try { hostUrl = new URL(`http://${host}`); }
    catch { return next(new HttpError(403, 'INVALID_HOST', 'A valid loopback Host header is required.')); }
    if (!host || !localHosts.has(hostUrl.hostname) || Number(hostUrl.port || 80) !== req.socket.localPort) {
      return next(new HttpError(403, 'LOOPBACK_ONLY', 'This prototype accepts requests to its loopback address and port only.'));
    }
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); }
      catch { return next(new HttpError(403, 'INVALID_ORIGIN', 'The browser origin is not allowed.')); }
      if (!localHosts.has(origin.hostname) || origin.protocol !== 'http:' ||
          !(Number(origin.port || 80) === req.socket.localPort || (development && Number(origin.port) === 5180))) {
        return next(new HttpError(403, 'ORIGIN_REJECTED', 'Cross-origin browser access is not allowed.'));
      }
    }
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation && req.path !== '/mcp' && !['ui', 'sdk'].includes(req.headers['x-afr-client'])) {
      return next(new HttpError(403, 'CLIENT_HEADER_REQUIRED', 'Mutations require X-AFR-Client: ui or sdk. This is a CSRF guard, not authentication.'));
    }
    if (mutation && !req.is('application/json')) return next(new HttpError(415, 'JSON_REQUIRED', 'Send an application/json request body.'));
    next();
  };
}
export function createApplication({ databasePath = join(root, 'data', 'flight-recorder.sqlite'), serveStatic = true, development = false, recover = true } = {}) {
  const store = new Store(databasePath);
  if (recover) store.interruptAbandonedRuns();
  const runner = new DemoRunner(store);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (req.path.startsWith('/api') || req.path === '/mcp') res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(boundary(development));
  app.use(express.json({ limit: '6mb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', name: 'Agent Flight Recorder', version: '1.0.0',
    modelMode: 'scripted-demo', mcpPath: '/mcp', collectorUrl: `http://127.0.0.1:${req.socket.localPort}`, persistent: databasePath !== ':memory:' }));
  app.get('/api/overview', (req, res) => {
    const runs = store.listRuns();
    const finished = runs.filter(run => run.endedAt);
    res.json({ stats: {
      runs: runs.length, completed: runs.filter(run => run.status === 'completed').length,
      failed: runs.filter(run => run.status === 'failed' || run.status === 'interrupted').length,
      blocked: runs.filter(run => run.status === 'blocked').length,
      awaitingApproval: runs.filter(run => !run.readOnly && run.status === 'awaiting_approval').length,
      events: runs.reduce((sum, run) => sum + run.eventCount, 0),
      toolCalls: runs.reduce((sum, run) => sum + run.metrics.toolCalls, 0),
      retries: runs.reduce((sum, run) => sum + run.metrics.retries, 0),
      averageDurationMs: finished.length ? finished.reduce((sum, run) => sum + run.metrics.durationMs, 0) / finished.length : 0,
    }, runs, insights: runs.slice(0, 30).flatMap(run => store.detail(run.id).insights), policies });
  });
  app.get('/api/runs', (req, res) => {
    const filter = z.object({ q: z.string().max(200).optional(), status: z.enum(['', 'running', 'awaiting_approval', 'completed', 'failed', 'blocked', 'interrupted']).optional() }).strict().parse(req.query);
    res.json({ runs: store.listRuns(filter) });
  });
  app.get('/api/scenarios', (req, res) => res.json({ scenarios }));
  app.get('/api/policies', (req, res) => res.json({ policies }));
  app.get('/api/outbox', (req, res) => res.json({ deliveries: store.deliveries() }));
  app.post('/api/demos', async (req, res) => res.status(201).json(await runner.start(demoSchema.parse(req.body))));
  app.post('/api/runs/:id/fork', async (req, res) => res.status(201).json(await runner.start(demoSchema.parse(req.body), req.params.id)));
  app.post('/api/approvals/:id/resolve', async (req, res) => res.json(await runner.resolve(req.params.id, approvalSchema.parse(req.body))));
  app.get('/api/runs/:id', (req, res) => res.json(store.detail(req.params.id)));
  app.get('/api/runs/:id/replay', (req, res) => {
    const detail = store.detail(req.params.id);
    const { cursor } = z.object({ cursor: z.coerce.number().int().min(0).max(detail.events.length) }).strict().parse(req.query);
    res.json(replay(detail.events, cursor));
  });
  app.get('/api/runs/:id/compare/:otherId', (req, res) => res.json(compareRuns(store.detail(req.params.id), store.detail(req.params.otherId))));
  app.get('/api/runs/:id/export', (req, res) => {
    const { format } = z.object({ format: z.enum(['json', 'markdown', 'otlp']).default('json') }).strict().parse(req.query);
    const detail = store.detail(req.params.id);
    const extension = format === 'markdown' ? 'md' : 'json';
    res.set('Content-Disposition', `attachment; filename="flight-${detail.run.id}${format === 'otlp' ? '-otlp' : ''}.${extension}"`);
    if (format === 'markdown') return res.type('text/markdown').send(markdownReport(detail));
    res.type('application/json').send(JSON.stringify(format === 'otlp' ? otlpExport(detail) : store.exportRecording(req.params.id)));
  });
  app.post('/api/import', (req, res) => {
    const body = z.object({ recording: z.unknown() }).strict().parse(req.body);
    res.status(201).json(store.importRecording(body.recording));
  });
  app.post('/api/capture/runs', (req, res) => res.status(201).json(store.createRun(createRunSchema.parse(req.body))));
  app.post('/api/capture/runs/:id/events', (req, res) => {
    const { events } = batchSchema.parse(req.body);
    res.json({ events: store.capture(req.params.id, req.headers['x-afr-write-token'], events) });
  });
  app.post('/api/capture/runs/:id/finish', (req, res) => res.json(store.finish(req.params.id, req.headers['x-afr-write-token'], finishSchema.parse(req.body))));
  mountMcp(app, store);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } }));
  if (serveStatic) {
    const dist = join(root, 'dist');
    app.use(express.static(dist, { index: false, dotfiles: 'deny' }));
    app.get('/{*path}', (req, res) => {
      if (!existsSync(join(dist, 'index.html'))) throw new HttpError(503, 'FRONTEND_NOT_BUILT', 'Run npm run build, then reload.');
      res.set('Cache-Control', 'no-cache').sendFile(join(dist, 'index.html'));
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) return res.status(422).json({ error: { code: 'VALIDATION_ERROR',
      message: error.issues.slice(0, 5).map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ') } });
    if (error instanceof HttpError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'The request body exceeds 6 MiB.' } });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    if (error instanceof TypeError && error.message.startsWith('Record')) return res.status(422).json({ error: { code: 'INVALID_RECORDED_VALUE', message: error.message } });
    console.error('[Agent Flight Recorder] Request failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The recorder could not complete this request. See the local server console.' } });
  });
  return { app, store, runner, async close() { runner.closing = true; await runner.idle(); store.close(); } };
}
