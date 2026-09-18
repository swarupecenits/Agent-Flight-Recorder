import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { responseSchema, type WorkerState } from './protocol.ts';

export class RecorderBridge {
  private child: ChildProcess | null = null;
  private requests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private disposed = false;
  constructor(private workerPath: string, private report: (error: string) => void) {}
  get processId() { return this.child?.pid ?? null; }
  async start(directory: string, keyBase64: string): Promise<WorkerState> {
    if (this.child) throw new Error('The recorder worker is already running.');
    const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' };
    for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    this.child = fork(this.workerPath, [], { env, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    this.child.stderr?.on('data', () => this.report('The isolated recorder worker reported a diagnostic. Its operation errors are shown in the workbench; payloads are not logged.'));
    this.child.on('message', message => {
      const parsed = responseSchema.safeParse(message);
      if (!parsed.success) { this.report('Rejected an invalid recorder response.'); return; }
      const pending = this.requests.get(parsed.data.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.requests.delete(parsed.data.id);
      if (parsed.data.ok) pending.resolve(parsed.data.data); else pending.reject(new Error(parsed.data.error));
    });
    this.child.on('error', error => this.fail(new Error(`Recorder process error: ${error.message}`)));
    this.child.on('exit', (code, signal) => {
      this.child = null;
      this.fail(new Error(`The recorder process exited (${code ?? signal ?? 'unknown'}). Open the workbench again; originals on disk are unchanged.`));
    });
    return this.call<WorkerState>('initialize', { directory, keyBase64 });
  }
  private fail(error: Error) {
    for (const value of this.requests.values()) { clearTimeout(value.timer); value.reject(error); }
    this.requests.clear();
    if (!this.disposed) this.report(error.message);
  }
  call<T>(method: string, payload: unknown = {}): Promise<T> {
    if (!this.child?.connected || this.disposed) return Promise.reject(new Error('The isolated recorder process is not connected.'));
    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error('The recorder request timed out. No automatic retry was performed.'));
      }, 30000);
      this.requests.set(id, { resolve, reject, timer });
      this.child!.send({ id, method, payload }, error => {
        if (error) { clearTimeout(timer); this.requests.delete(id); reject(new Error('The recorder request could not be delivered.')); }
      });
    }) as Promise<T>;
  }
  dispose() {
    this.disposed = true;
    this.fail(new Error('The recorder controller was disposed.'));
    if (this.child?.connected) this.child.disconnect();
    this.child = null;
  }
}
