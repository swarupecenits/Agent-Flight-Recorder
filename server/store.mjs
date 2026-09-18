import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { redact } from '../sdk/privacy.mjs';
import { canonical, digest, hashEvent, verifyChain, metricsFor, analyzeRun, TERMINAL_STATUSES, TERMINAL_TYPES } from '../shared/trace.mjs';
import { createRunSchema, eventSchema, finishSchema, recordingSchema, HttpError, validateUsage } from './schemas.mjs';

const MAX_EVENTS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_EVENT_BYTES = 64 * 1024;
const parse = value => JSON.parse(value);
const now = () => new Date().toISOString();

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, header TEXT NOT NULL, status TEXT NOT NULL,
        ended_at TEXT, token_hash TEXT, readonly INTEGER NOT NULL DEFAULT 0,
        root_hash TEXT NOT NULL, event_count INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        run_id TEXT NOT NULL REFERENCES runs(id), seq INTEGER NOT NULL, id TEXT NOT NULL,
        input_hash TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,seq), UNIQUE(run_id,id)
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), status TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id), body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_owner (
        id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, owner TEXT NOT NULL
      );
    `);
    this.owner = randomUUID();
    try {
      this.transaction(() => {
        const existing = this.db.prepare('SELECT pid FROM workspace_owner WHERE id=1').get();
        if (existing) {
          let alive = true;
          try { process.kill(existing.pid, 0); }
          catch (error) {
            if (error.code === 'ESRCH') alive = false;
            else if (error.code !== 'EPERM') throw error;
          }
          if (alive) throw new HttpError(409, 'DATABASE_IN_USE', `This database is already open by process ${existing.pid}. Stop that recorder or choose a separate AFR_DB_PATH.`);
        }
        this.db.prepare('INSERT OR REPLACE INTO workspace_owner(id,pid,owner) VALUES(1,?,?)').run(process.pid, this.owner);
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.prepare('DELETE FROM workspace_owner WHERE owner=?').run(this.owner);
    this.db.close();
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      if (value?.then) throw new Error('SQLite transactions must be synchronous.');
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  row(id) {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'RUN_NOT_FOUND', 'The recording does not exist.');
    return row;
  }
  events(id) { return this.db.prepare('SELECT body FROM events WHERE run_id=? ORDER BY seq').all(id).map(row => parse(row.body)); }
  run(id) {
    const row = this.row(id);
    const header = parse(row.header);
    const run = { ...header, origin: row.readonly ? 'import' : header.origin, status: row.status, endedAt: row.ended_at,
      eventCount: row.event_count, rootHash: row.root_hash, readOnly: Boolean(row.readonly) };
    return { ...run, metrics: metricsFor(run, this.events(id)) };
  }
  listRuns({ q = '', status = '' } = {}) {
    return this.db.prepare('SELECT id FROM runs ORDER BY rowid DESC').all().map(row => this.run(row.id))
      .filter(run => (!status || run.status === status) && (!q || `${run.name} ${run.agentName} ${run.scenarioId ?? ''} ${run.id} ${run.traceId}`.toLowerCase().includes(q.toLowerCase())));
  }
  createRun(input, { origin = 'sdk', scenarioId = null, parentRunId = null } = {}) {
    const clean = redact(createRunSchema.parse(input));
    if (Buffer.byteLength(canonical(clean.value)) > MAX_EVENT_BYTES) throw new HttpError(413, 'INPUT_TOO_LARGE', 'Run metadata and input exceed 64 KiB.');
    const header = { ...clean.value, id: randomUUID(), traceId: randomBytes(16).toString('hex'), startedAt: now(), origin, scenarioId, parentRunId };
    const writeToken = randomBytes(32).toString('hex');
    return this.transaction(() => {
      if (this.db.prepare('SELECT count(*) AS total FROM runs').get().total >= 500) throw new HttpError(409, 'WORKSPACE_FULL', 'This local prototype supports up to 500 recordings per database. Use a separate database to capture more.');
      this.db.prepare('INSERT INTO runs(id,header,status,token_hash,root_hash) VALUES(?,?,?,?,?)')
        .run(header.id, canonical(header), 'running', digest(writeToken), digest(header));
      this.appendOne(header.id, { type: 'run.started', name: header.name, input: header.input,
        attributes: { agentName: header.agentName, origin, scenarioId }, redactedPaths: [...new Set([...header.redactedPaths, ...clean.paths])] }, true);
      return { runId: header.id, traceId: header.traceId, writeToken };
    });
  }
  authorize(id, token) {
    const row = this.row(id);
    if (row.readonly || !row.token_hash || typeof token !== 'string' ||
        !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(digest(token), 'hex'))) {
      throw new HttpError(403, 'CAPTURE_TOKEN_REQUIRED', 'A valid per-run write token is required. Imported recordings cannot be modified.');
    }
    return row;
  }
  appendOne(id, input, system = false) {
    const draft = eventSchema.parse(input);
    validateUsage(draft);
    if (!system && (draft.type === 'run.started' || TERMINAL_TYPES.has(draft.type))) {
      throw new HttpError(422, 'RESERVED_EVENT', 'Run lifecycle events are managed by the capture start and finish endpoints.');
    }
    const clean = redact(draft);
    const fingerprint = digest(clean.value);
    if (draft.id) {
      const existing = this.db.prepare('SELECT body,input_hash FROM events WHERE run_id=? AND id=?').get(id, draft.id);
      if (existing) {
        if (existing.input_hash !== fingerprint) throw new HttpError(409, 'EVENT_CONFLICT', 'The event ID already exists with a different payload.');
        return parse(existing.body);
      }
    }
    const row = this.row(id);
    if (row.readonly || TERMINAL_STATUSES.has(row.status)) throw new HttpError(409, 'RUN_CLOSED', 'The recording is immutable after it ends.');
    if (row.event_count >= (system ? MAX_EVENTS : MAX_EVENTS - 2)) throw new HttpError(413, 'EVENT_LIMIT', 'A recording may contain at most 1,000 events; two slots are reserved for final output and termination.');
    const header = parse(row.header);
    const timestamp = now();
    const event = { ...clean.value, id: draft.id ?? randomUUID(), runId: id, traceId: header.traceId,
      seq: row.event_count + 1, timestamp: draft.timestamp ?? timestamp, recordedAt: timestamp,
      redactedPaths: [...new Set([...draft.redactedPaths, ...clean.paths])], previousHash: row.root_hash };
    event.hash = hashEvent(event);
    const body = canonical(event);
    const bytes = Buffer.byteLength(body);
    if (bytes > MAX_EVENT_BYTES || row.bytes + bytes > (system ? MAX_BYTES : MAX_BYTES - 2 * MAX_EVENT_BYTES)) throw new HttpError(413, 'RECORDING_TOO_LARGE', 'Limits are 64 KiB per event and 4 MiB per recording, including reserved termination space. No partial event was stored.');
    this.db.prepare('INSERT INTO events(run_id,seq,id,input_hash,body) VALUES(?,?,?,?,?)').run(id, event.seq, event.id, fingerprint, body);
    this.db.prepare('UPDATE runs SET root_hash=?,event_count=event_count+1,bytes=bytes+? WHERE id=?').run(event.hash, bytes, id);
    if (TERMINAL_TYPES.has(event.type)) {
      this.db.prepare('UPDATE runs SET status=?,ended_at=? WHERE id=?').run(event.type.slice(4), event.recordedAt, id);
    }
    return event;
  }
  capture(id, token, events) {
    this.authorize(id, token);
    return this.transaction(() => events.map(event => this.appendOne(id, event)));
  }
  finish(id, token, input) {
    this.authorize(id, token);
    const result = finishSchema.parse(input);
    return this.transaction(() => {
      if (Object.hasOwn(result, 'output')) this.appendOne(id, { type: 'output', name: 'Final agent output', output: result.output, redactedPaths: result.redactedPaths }, true);
      this.appendOne(id, { type: `run.${result.status}`, name: `Run ${result.status}`, error: result.error ?? null, redactedPaths: result.redactedPaths }, true);
      return this.run(id);
    });
  }
  detail(id) {
    const row = this.row(id);
    const run = this.run(id);
    const events = this.events(id);
    return { run, events, ...analyzeRun(run, events), approvals: this.approvals(id), deliveries: this.deliveries(id),
      integrity: verifyChain(parse(row.header), events, row.root_hash) };
  }
  approvals(id) { return this.db.prepare('SELECT body FROM approvals WHERE run_id=? ORDER BY rowid').all(id).map(row => parse(row.body)); }
  deliveries(id) {
    const rows = id ? this.db.prepare('SELECT body FROM deliveries WHERE run_id=?').all(id) : this.db.prepare('SELECT body FROM deliveries ORDER BY rowid DESC').all();
    return rows.map(row => parse(row.body));
  }
  requestApproval(id, token, { tool, policyId, reason, input }) {
    this.authorize(id, token);
    const approval = { id: randomUUID(), runId: id, tool, policyId, reason, input, status: 'pending',
      requestedAt: now(), resolvedAt: null, actor: null, comment: null };
    return this.transaction(() => {
      this.appendOne(id, { type: 'approval.requested', name: `Approval required: ${tool}`, input,
        attributes: { approvalId: approval.id, policyId, reason } });
      this.db.prepare('INSERT INTO approvals(id,run_id,status,body) VALUES(?,?,?,?)').run(approval.id, id, 'pending', canonical(approval));
      this.db.prepare("UPDATE runs SET status='awaiting_approval' WHERE id=?").run(id);
      return approval;
    });
  }
  claimApproval(id, { decision, actor, comment }) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM approvals WHERE id=?').get(id);
      if (!row) throw new HttpError(404, 'APPROVAL_NOT_FOUND', 'The approval request does not exist.');
      const approval = parse(row.body);
      if (row.status !== 'pending') {
        if (row.status !== (decision === 'approve' ? 'approved' : 'rejected')) throw new HttpError(409, 'APPROVAL_ALREADY_RESOLVED', 'This request was already resolved with the opposite decision.');
        return { duplicate: true, approval };
      }
      const run = this.run(approval.runId);
      if (run.origin !== 'demo' || run.status !== 'awaiting_approval') throw new HttpError(409, 'APPROVAL_NOT_ACTIONABLE', 'This is not a pending, executable sandbox approval.');
      const cleanReviewer = redact({ actor, comment }).value;
      Object.assign(approval, { status: decision === 'approve' ? 'approved' : 'rejected', ...cleanReviewer, resolvedAt: now() });
      this.db.prepare('UPDATE approvals SET status=?,body=? WHERE id=?').run(approval.status, canonical(approval), id);
      const writeToken = randomBytes(32).toString('hex');
      this.db.prepare("UPDATE runs SET status='running',token_hash=? WHERE id=?").run(digest(writeToken), run.id);
      this.appendOne(run.id, { type: 'approval.resolved', name: `Approval decision: ${approval.status} ${approval.tool}`,
        input: approval.input, attributes: { approvalId: id, decision, ...cleanReviewer, policyId: approval.policyId },
        stateDelta: { approval: approval.status } });
      return { duplicate: false, approval, credentials: { runId: run.id, traceId: run.traceId, writeToken } };
    });
  }
  deliver(id, message) {
    const row = this.row(id);
    if (row.readonly || parse(row.header).origin !== 'demo' || row.status !== 'running') throw new HttpError(409, 'NOT_A_SANDBOX_RUN', 'Only an active sandbox demo can write to the local outbox.');
    const existing = this.deliveries(id)[0];
    if (existing) return existing;
    const delivery = { id: randomUUID(), runId: id, ...message, createdAt: now(), channel: 'local-outbox',
      disclaimer: 'Sandbox receipt only. No email was sent and no external service was contacted.' };
    this.db.prepare('INSERT INTO deliveries(id,run_id,body) VALUES(?,?,?)').run(delivery.id, id, canonical(delivery));
    return delivery;
  }
  exportRecording(id) {
    const row = this.row(id);
    return { format: 'agent-flight-recorder', version: 1, header: parse(row.header), status: row.status,
      endedAt: row.ended_at, rootHash: row.root_hash, events: this.events(id) };
  }
  importRecording(input) {
    const recording = recordingSchema.parse(input);
    for (const event of recording.events) validateUsage(event);
    if (!verifyChain(recording.header, recording.events, recording.rootHash).valid) throw new HttpError(422, 'INVALID_CHAIN', 'The recording has missing, reordered, modified, or inconsistent events.');
    const last = recording.events.at(-1);
    if (recording.events[0].type !== 'run.started' || recording.events.slice(1).some(event => event.type === 'run.started') ||
        recording.events.slice(0, -1).some(event => TERMINAL_TYPES.has(event.type)) ||
        (TERMINAL_TYPES.has(last.type) ? recording.status !== last.type.slice(4) || recording.endedAt !== last.recordedAt : TERMINAL_STATUSES.has(recording.status) || recording.endedAt !== null)) {
      throw new HttpError(422, 'INVALID_LIFECYCLE', 'The recording lifecycle and terminal event disagree.');
    }
    for (const value of [recording.header, ...recording.events]) {
      if (canonical(redact(value).value) !== canonical(value)) throw new HttpError(422, 'UNREDACTED_IMPORT', 'Credential-like data was detected in this import. Redact at the source and export again; a hashed recording cannot be silently rewritten.');
      if (Buffer.byteLength(canonical(value)) > MAX_EVENT_BYTES) throw new HttpError(413, 'EVENT_TOO_LARGE', 'An imported event or header exceeds 64 KiB.');
    }
    const size = recording.events.reduce((sum, event) => sum + Buffer.byteLength(canonical(event)), 0);
    if (size > MAX_BYTES) throw new HttpError(413, 'RECORDING_TOO_LARGE', 'The imported recording exceeds 4 MiB.');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM runs WHERE id=?').get(recording.header.id);
      if (existing) {
        if (existing.root_hash !== recording.rootHash || existing.header !== canonical(recording.header) || existing.status !== recording.status || existing.ended_at !== recording.endedAt) throw new HttpError(409, 'IMPORT_CONFLICT', 'A different version of this recording already exists. It was not overwritten.');
        return { runId: recording.header.id, duplicate: true };
      }
      if (this.db.prepare('SELECT count(*) AS total FROM runs').get().total >= 500) throw new HttpError(409, 'WORKSPACE_FULL', 'This workspace supports at most 500 recordings.');
      this.db.prepare('INSERT INTO runs(id,header,status,ended_at,readonly,root_hash,event_count,bytes) VALUES(?,?,?,?,1,?,?,?)')
        .run(recording.header.id, canonical(recording.header), recording.status, recording.endedAt, recording.rootHash, recording.events.length, size);
      const insert = this.db.prepare('INSERT INTO events(run_id,seq,id,input_hash,body) VALUES(?,?,?,?,?)');
      for (const event of recording.events) insert.run(event.runId, event.seq, event.id, digest(event), canonical(event));
      return { runId: recording.header.id, duplicate: false };
    });
  }
  interruptAbandonedRuns() {
    for (const row of this.db.prepare("SELECT id FROM runs WHERE status='running' AND readonly=0").all()) {
      this.transaction(() => this.appendOne(row.id, { type: 'run.interrupted', name: 'Recorder restarted during execution',
        error: { name: 'RecorderRestart', message: 'The previous process ended before a terminal event was recorded. Unfinished tools are not automatically re-executed.' } }, true));
    }
  }
}
