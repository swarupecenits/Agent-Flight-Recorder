import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

async function worker(directory, key) {
  const child = fork(fileURLToPath(new URL('../extension/dist/worker.cjs', import.meta.url)), [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  const pending = new Map();
  child.on('message', value => {
    const request = pending.get(value.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(value.id);
    value.ok ? request.resolve(value.data) : request.reject(new Error(value.error));
  });
  child.on('error', error => { for (const entry of pending.values()) entry.reject(error); });
  function call(method, payload = {}) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker test timed out.')); }, 15000);
      pending.set(id, { resolve, reject, timer }); child.send({ id, method, payload });
    });
  }
  async function close() {
    if (child.exitCode === null && child.connected) { const exit = once(child, 'exit'); child.disconnect(); await exit; }
  }
  try { await call('initialize', { directory, keyBase64: key.toString('base64') }); }
  catch (error) { await close(); throw error; }
  return { call, close, pid: child.pid };
}
test('the actual bundled worker encrypts, serializes IPC, recovers, deduplicates and reopens', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'afr-worker-test-'));
  const key = randomBytes(32);
  let active = await worker(directory, key);
  t.after(async () => { await active.close(); await rm(directory, { recursive: true, force: true }); });
  assert.notEqual(active.pid, process.pid);
  await assert.rejects(active.call('example', { scenarioId: 'stale', consent: false }), /schema/);
  const original = await active.call('example', { scenarioId: 'stale', consent: true });
  assert.equal(original.assessment.findings[0].verdict, 'Unverifiable', 'Bundling must not collapse distinct fixture versions.');
  const checkpoint = original.selected.recording.events.find(event => event.checkpoint);
  const planned = await active.call('plan', { findingId: original.assessment.findings[0].id, checkpointId: checkpoint.id, fresh: false });
  const request = { planId: planned.plan.id, approved: true, consent: true };
  const [first, duplicate] = await Promise.all([active.call('execute', request), active.call('execute', request)]);
  assert.equal(first.assessment.findings[0].verdict, 'Supported');
  assert.equal(first.selected.recording.run.id, duplicate.selected.recording.run.id);
  assert.equal(first.recordings.length, 2);
  assert.equal(first.comparison.linked, true);
  await active.call('artifact', { kind: 'review', title: 'PRIVATE_REVIEW_NAME', text: 'PRIVATE_REVIEW_BODY', consent: true });
  const files = await readdir(directory);
  assert.equal(files.length, 2);
  for (const file of files) assert.ok(!(await readFile(join(directory, file), 'utf8')).includes('PRIVATE_REVIEW'));
  await active.close(); active = await worker(directory, key);
  const restored = await active.call('state');
  assert.equal(restored.recordings.length, 2);
  const corrected = await active.call('select', { id: first.selected.recording.run.id });
  assert.equal(corrected.selected.artifacts[0].text, 'PRIVATE_REVIEW_BODY');
});
