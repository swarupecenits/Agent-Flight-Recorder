import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { adapterHealth } from '../../lens/adapters.ts';
import { defaultSettings, exampleScenarios } from '../../lens/catalog.ts';
import { hash, settingsSchema } from '../../lens/schema.ts';
import type { LensSettings, SourceHealth, WorkbenchAction, WorkbenchState } from '../../lens/types.ts';
import { actionSchema, type WorkerState } from './protocol.ts';
import { RecorderBridge } from './bridge.ts';
import { captureTask, describeTask } from './capture.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const settingsKey = 'evidence-lens.privacy.v1';
const message = (error: unknown) => error instanceof Error ? error.message : 'The operation failed. Nothing was silently substituted.';
function collectorUrl(): URL {
  const url = new URL(vscode.workspace.getConfiguration('agentEvidenceLens').get<string>('collectorUrl', 'http://127.0.0.1:4180'));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Choose a loopback HTTP collector address without a path or credentials.');
  return url;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const base = collectorUrl();
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    signal: AbortSignal.timeout(100000), headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-AFR-Client': 'ui' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.body) throw new Error('The local collector returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('The collector response exceeds the 8 MiB limit.'); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The collector did not return valid JSON. Start the updated Agent Flight Recorder backend.'); }
  if (!response.ok) {
    const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(value);
    throw new Error(error.success ? error.data.error.message : `The collector request failed (HTTP ${response.status}).`);
  }
  return value as T;
}
class ReviewDocuments implements vscode.TextDocumentContentProvider {
  private values = new Map<string, string>();
  provideTextDocumentContent(uri: vscode.Uri) {
    const content = this.values.get(uri.toString());
    if (content === undefined) throw new Error('This temporary review has expired. Prepare a new preview.');
    return content;
  }
  async document(name: string, content: string) {
    const uri = vscode.Uri.from({ scheme: 'evidence-lens-review', path: `/${randomUUID()}/${name}` });
    this.values.set(uri.toString(), content);
    return vscode.workspace.openTextDocument(uri);
  }
  close(uri: vscode.Uri) { this.values.delete(uri.toString()); }
  dispose() { this.values.clear(); }
}
class Controller {
  private panel: vscode.WebviewPanel | undefined;
  private bridge: RecorderBridge | undefined;
  private starting: Promise<void> | undefined;
  private webviewReady = false;
  private privacyPending = false;
  private reviews = new ReviewDocuments();
  private state: WorkbenchState = { settings: defaultSettings, recordings: [], selected: null, assessment: null, comparison: null,
    plan: null, health: adapterHealth, error: null, notice: null, busy: false };
  readonly keyId: string;
  constructor(private context: vscode.ExtensionContext) {
    this.keyId = `evidence-lens.key.v1:${hash(context.globalStorageUri.toString()).slice(0, 32)}`;
    const saved = context.globalState.get<unknown>(settingsKey);
    if (saved !== undefined) {
      const parsed = settingsSchema.safeParse(saved);
      if (parsed.success) this.state.settings = parsed.data;
      else this.state.error = 'Saved privacy choices are invalid. Defaults are off; review Privacy before recording.';
    }
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('evidence-lens-review', this.reviews),
      vscode.workspace.onDidCloseTextDocument(document => {
        if (document.uri.scheme === 'evidence-lens-review') this.reviews.close(document.uri);
      }), this.reviews);
  }
  private post() { void this.panel?.webview.postMessage({ type: 'state', state: this.state }); }
  private update(patch: Partial<WorkbenchState>) { this.state = { ...this.state, ...patch }; this.post(); }
  private disconnectWorker() { this.bridge?.dispose(); this.bridge = undefined; }
  private async worker(): Promise<RecorderBridge> {
    if (this.bridge) return this.bridge;
    if (!this.starting) this.starting = (async () => {
      const directory = join(this.context.globalStorageUri.fsPath, 'encrypted-vault');
      let key = await this.context.secrets.get(this.keyId);
      if (!key) {
        let entries: string[] = [];
        try { entries = await readdir(directory); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (entries.some(name => name.endsWith('.lens.enc'))) throw new Error('Encrypted records exist but their SecretStorage key is missing. Restore the original key/profile; a new key will not be silently generated over this vault.');
        const bytes = randomBytes(32);
        key = bytes.toString('base64'); bytes.fill(0);
        await this.context.secrets.store(this.keyId, key);
      }
      if (Buffer.from(key, 'base64').length !== 32) throw new Error('The SecretStorage encryption key is invalid. Existing encrypted files were not changed.');
      const bridge = new RecorderBridge(this.context.asAbsolutePath(join('dist', 'worker.cjs')), error => {
        this.update({ error }); this.bridge = undefined;
      });
      try {
        const state = await bridge.start(directory, key);
        this.bridge = bridge; this.update(state);
      } catch (error) { bridge.dispose(); throw error; }
    })().finally(() => { this.starting = undefined; });
    await this.starting;
    if (!this.bridge) throw new Error('The isolated recorder could not start.');
    return this.bridge;
  }
  private async apply(method: string, payload: unknown = {}) {
    this.update(await (await this.worker()).call<WorkerState>(method, payload));
  }
  private async settings(value: LensSettings) {
    const settings = settingsSchema.parse(value);
    if (!settings.consent && (settings.captureContent || settings.liveCapture || settings.externalAnalysis)) throw new Error('Enable local consent before any optional recording or analysis capability.');
    await this.context.globalState.update(settingsKey, settings);
    this.update({ settings });
  }
  private async consent(): Promise<boolean> {
    if (this.state.settings.consent) return true;
    const approved = await vscode.window.showInformationMessage('Allow local Evidence Lens recordings?', { modal: true,
      detail: 'Explicit imports and selected runs are encrypted on this device. No private Chat panels or hidden reasoning are captured. Content is minimized and external analysis is off by default.' }, 'Allow local recording');
    if (approved !== 'Allow local recording') return false;
    await this.settings({ ...this.state.settings, consent: true });
    return true;
  }
  private async review(title: string, text: string, detail: string, approve: string): Promise<boolean> {
    const document = await this.reviews.document('review.txt', text);
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preview: true, preserveFocus: false });
    return await vscode.window.showInformationMessage(title, { modal: true, detail }, approve) === approve;
  }
  private async artifact(kind: 'correction' | 'handoff' | 'model-draft' | 'instruction-proposal' | 'review', title: string, text: string) {
    if (!(await this.consent())) return;
    await this.apply('artifact', { kind, title, text, consent: true });
  }
  open() {
    if (this.panel) { this.panel.reveal(this.panel.viewColumn, false); return; }
    this.webviewReady = false;
    this.panel = vscode.window.createWebviewPanel('agentEvidenceLens.workbench', 'Evidence Lens', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false }, {
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    });
    const webview = this.panel.webview;
    const nonce = randomBytes(18).toString('hex');
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const script = escape(webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')).toString());
    const style = escape(webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')).toString());
    webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f3f1ea"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${style}"><title>Evidence Lens</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    this.panel.onDidDispose(() => { this.panel = undefined; this.webviewReady = false; });
    this.context.subscriptions.push(webview.onDidReceiveMessage((input: unknown) => {
      const parsed = actionSchema.safeParse(input);
      if (!parsed.success) { this.update({ error: 'Rejected an unsupported workbench action. No operation was executed.' }); return; }
      void this.dispatch(parsed.data);
    }));
  }
  async dispatch(action: WorkbenchAction) {
    if (action.type === 'ready') {
      this.webviewReady = true;
      if (this.privacyPending) { this.privacyPending = false; void this.panel?.webview.postMessage({ type: 'privacy' }); }
      try { await this.worker(); this.post(); await this.health(); } catch (error) { this.update({ error: message(error) }); }
      return;
    }
    if (action.type === 'privacy') {
      if (this.webviewReady) void this.panel?.webview.postMessage({ type: 'privacy' });
      else this.privacyPending = true;
      return;
    }
    if (this.state.busy) { void vscode.window.showInformationMessage('Finish or cancel the current Evidence Lens operation first.'); return; }
    this.update({ busy: true, error: null, notice: null });
    try {
      switch (action.type) {
        case 'updatePrivacy': await this.settings(action.settings); break;
        case 'example':
          if (await this.consent()) await this.apply('example', { scenarioId: action.scenarioId, consent: true });
          break;
        case 'import': await this.importFile(); break;
        case 'select': await this.apply('select', { id: action.runId }); break;
        case 'compare': await this.apply('compare', { id: action.runId }); break;
        case 'importCollector': await this.importCollector(); break;
        case 'liveDemo': await this.liveDemo(action.scenarioId); break;
        case 'modelReview': await this.modelReview(); break;
        case 'captureValidation': await this.captureValidation(); break;
        case 'planRecovery': await this.apply('plan', { findingId: action.findingId, checkpointId: action.checkpointId, fresh: action.fresh }); break;
        case 'executeRecovery':
          if (await this.consent()) await this.apply('execute', { planId: action.planId, approved: true, consent: true });
          this.update({ notice: 'A linked mock run was created. Original evidence stays unchanged; compare before and after.' });
          break;
        case 'draftCorrection': {
          const finding = this.state.assessment?.findings.find(item => item.id === action.findingId);
          if (!finding) throw new Error('Choose an available finding first.');
          if (await this.review('Save this reviewed correction?', finding.correction, 'This is a separate encrypted draft. It will not rewrite the original claim or verdict.', 'Save draft')) await this.artifact('correction', 'Reviewed claim correction', finding.correction);
          break;
        }
        case 'reviewFinding':
          if (!this.state.assessment?.findings.some(item => item.id === action.findingId)) throw new Error('Choose an available finding first.');
          await this.artifact('review', `Finding ${action.decision}`, `${action.findingId}: ${action.decision}. Human review only; the computed verdict is unchanged.`);
          break;
        case 'export': await this.export(action.format); break;
        case 'instructionProposal': await this.instructionProposal(); break;
        case 'purge': await this.purge(); break;
        case 'existingChat': {
          const commands = await vscode.commands.getCommands(true);
          if (!commands.includes('workbench.action.chat.open')) throw new Error('Regular Chat is not available in this VS Code installation. Evidence Lens does not supply or alter private Chat panels.');
          await vscode.commands.executeCommand('workbench.action.chat.open'); break;
        }
      }
    } catch (error) { this.update({ error: message(error) }); }
    finally { this.update({ busy: false }); }
  }
  private async health() {
    const sources: SourceHealth[] = adapterHealth.map(item => item.id === 'vscode-task' ? { ...item,
      status: this.state.settings.liveCapture ? 'capturing' : 'disabled',
      detail: 'Public Tasks API; only a selected, approved task. Private terminal transcripts, Chat panels, and hidden reasoning are not intercepted.' } : item);
    try {
      const result = await api<{ provider: { ready: boolean; deployment: string; reason: string } }>('/api/lens/status');
      sources.push({ id: 'azure-responses', version: 'v1', status: result.provider.ready ? 'capturing' : 'disabled',
        detail: result.provider.ready ? `${result.provider.deployment} is configured in the local backend. Every external request is previewed and approved.` : result.provider.reason, capabilities: ['optional-model-draft'] });
    } catch (error) {
      sources.push({ id: 'local-collector', version: null, status: 'unavailable',
        detail: `Optional collector unavailable: ${message(error)}. Start the updated backend for collector import and Azure review; local examples/imports still work.`, capabilities: [] });
    }
    this.update({ health: sources });
  }
  private async importFile() {
    if (!(await this.consent())) return;
    const files = await vscode.window.showOpenDialog({ title: 'Import an explicit evidence recording', canSelectMany: false, filters: { 'Recording JSON': ['json'] } });
    if (!files?.[0]) return;
    const stat = await vscode.workspace.fs.stat(files[0]);
    if (stat.size > 6 * 1024 * 1024) throw new Error('Choose a recording no larger than 6 MiB.');
    let recording: unknown;
    try { recording = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(files[0]))); }
    catch { throw new Error('The selected recording could not be read as JSON. Check file access and choose a supported versioned export.'); }
    await this.apply('import', { recording, captureContent: this.state.settings.captureContent, consent: true });
  }
  private async importCollector() {
    if (!(await this.consent())) return;
    const value = await api<{ runs: { id: string; name: string; status: string }[] }>('/api/runs');
    if (!value.runs.length) throw new Error('No collector recordings are available. Record a demo or connect your agent first.');
    const selected = await vscode.window.showQuickPick(value.runs.map(run => ({ label: run.name, description: run.status, id: run.id })), { title: 'Choose the collector recording to import' });
    if (!selected) return;
    const recording = await api<unknown>(`/api/runs/${encodeURIComponent(selected.id)}/export?format=json`);
    await this.apply('import', { recording, captureContent: this.state.settings.captureContent, consent: true });
    this.update({ notice: 'Saved an encrypted derivative. The collector original remains in its separate plaintext SQLite store.' });
  }
  private async liveDemo(scenarioId: typeof exampleScenarios[number]['id']) {
    if (!(await this.consent())) return;
    const prepared = await api<{ prepareId: string; context: string; endpoint: string }>('/api/lens/live-demo/prepare', { scenarioId });
    if (!(await this.review('Approve this live Azure demo?', prepared.context,
      `Send the exact synthetic evidence preview to ${prepared.endpoint}? Model usage may be charged. No source files or private recordings are sent; the model does not execute tools or change deterministic verdicts.`, 'Approve live Azure'))) return;
    await this.settings({ ...this.state.settings, externalAnalysis: true });
    const result = await api<{ recording: unknown; draft: { text: string } }>('/api/lens/live-demo', { scenarioId, prepareId: prepared.prepareId, consent: true, requestId: randomUUID() });
    await this.apply('import', { recording: result.recording, captureContent: this.state.settings.captureContent, consent: true });
    await this.artifact('model-draft', 'Live Azure handoff / requires human review', result.draft.text);
    this.update({ notice: 'A real Azure streaming response was captured. Its draft is saved separately in Handoff; deterministic evidence verdicts are unchanged.' });
  }
  private async modelReview() {
    if (!this.state.selected || !(await this.consent())) return;
    const recording = this.state.selected.recording;
    const preview = await api<{ context: string; endpoint: string }>('/api/lens/model-context', { recording });
    if (!(await this.review('Approve external analysis of this evidence?', preview.context,
      `The preview may contain repository/resource identities and claims. Send this exact metadata to ${preview.endpoint}? Raw prompts and source excerpts are omitted. Provider service policies and usage charges apply.`, 'Approve Azure draft'))) return;
    await this.settings({ ...this.state.settings, externalAnalysis: true });
    const draft = await api<{ text: string }>('/api/lens/model-review', { recording, consent: true, requestId: randomUUID() });
    await this.artifact('model-draft', 'Azure-assisted handoff / advisory only', draft.text);
  }
  private async folder() {
    const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
    if (!folders.length) throw new Error('Open a local Git repository folder in VS Code first.');
    if (folders.length === 1) return folders[0];
    const selected = await vscode.window.showQuickPick(folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })), { title: 'Choose the exact workspace scope' });
    return selected?.folder;
  }
  private async captureValidation() {
    if (!vscode.workspace.isTrusted) throw new Error('Selected task execution requires a trusted workspace. Review workspace trust yourself; Evidence Lens cannot bypass it.');
    if (!(await this.consent())) return;
    const folder = await this.folder();
    if (!folder) return;
    const tasks = (await vscode.tasks.fetchTasks()).filter(task => !task.isBackground && typeof task.scope === 'object' && task.scope.uri.toString() === folder.uri.toString());
    const packageUri = vscode.Uri.joinPath(folder.uri, 'package.json');
    try {
      const manifest = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(packageUri))) as { scripts?: { test?: string } };
      if (typeof manifest.scripts?.test === 'string') tasks.push(new vscode.Task({ type: 'shell' }, folder, 'npm test', 'Evidence Lens', new vscode.ShellExecution('npm test')));
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw new Error('Workspace package.json is unreadable or invalid. Fix it before creating a validation task.');
    }
    if (!tasks.length) throw new Error('Define a foreground validation task in VS Code Tasks, or add a test script to package.json. No arbitrary shell command will be invented.');
    const selected = await vscode.window.showQuickPick(tasks.map(task => ({ label: task.name, description: task.source, task })), { title: 'Choose the exact task to execute and observe' });
    if (!selected) return;
    const approved = await vscode.window.showWarningMessage('Execute and capture this selected task?', { modal: true,
      detail: `Workspace: ${folder.name}\nTask: ${selected.task.name}\nCommand: ${describeTask(selected.task)}\n\nThis is real workspace code, NOT the isolated mock harness. It can write files or use the network. Only its public exit status and before/after file-set hashes are recorded; no terminal output is intercepted. Observation stops after 10 minutes or cancellation without automatically terminating the task.` }, 'Execute selected task');
    if (approved !== 'Execute selected task') return;
    await this.settings({ ...this.state.settings, liveCapture: true });
    const recording = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Evidence Lens: observing the selected task', cancellable: true },
      (_, token) => captureTask(selected.task, folder, token));
    await this.apply('import', { recording, captureContent: false, consent: true });
    await this.health();
  }
  private async export(format: 'json' | 'markdown') {
    if (!this.state.selected || !this.state.assessment) throw new Error('Choose a recording before exporting.');
    const recording = this.state.selected.recording;
    const text = format === 'json' ? JSON.stringify(recording, null, 2) : this.state.assessment.summary;
    if (!(await this.review('Save this reviewed plaintext export?', text,
      'This exact output is not encrypted. Check it before saving or sharing. Private review artifacts/model drafts are not included in the immutable recording JSON.', 'Save reviewed export'))) return;
    const file = await vscode.window.showSaveDialog({ title: 'Save reviewed evidence export', defaultUri: vscode.Uri.file(join(homedir(), 'Downloads', `evidence-${recording.run.id}.${format === 'json' ? 'json' : 'md'}`)),
      filters: format === 'json' ? { JSON: ['json'] } : { Markdown: ['md'] } });
    if (!file) return;
    await vscode.workspace.fs.writeFile(file, encoder.encode(text));
    this.update({ notice: 'The reviewed plaintext export was saved. The encrypted original is unchanged.' });
  }
  private async purge() {
    const bridge = await this.worker();
    const ids = await bridge.call<string[]>('expired', { days: this.state.settings.retentionDays });
    if (!ids.length) { this.update({ notice: 'No encrypted records have reached the selected retention limit.' }); return; }
    const selected = this.state.recordings.filter(item => ids.includes(item.id));
    const approved = await vscode.window.showWarningMessage(`Permanently remove ${ids.length} expired encrypted recordings?`, { modal: true,
      detail: selected.map(item => `${item.name} [${item.id}]`).join('\n') + '\nOnly these vault records and their encrypted review artifacts will be removed. This cannot be undone.' }, 'Remove listed records');
    if (approved === 'Remove listed records') await this.apply('purge', { ids, days: this.state.settings.retentionDays, approved: true });
  }
  private async instructionProposal() {
    if (!vscode.workspace.isTrusted) throw new Error('Writing a workspace instruction requires a trusted workspace.');
    if (!this.state.assessment?.requiredChecks.length || !(await this.consent())) throw new Error('Choose an unresolved finding before proposing a rule.');
    const folder = await this.folder();
    if (!folder) return;
    const relative = '.github/instructions/evidence-lens.instructions.md';
    const target = vscode.Uri.joinPath(folder.uri, '.github', 'instructions', 'evidence-lens.instructions.md');
    const checkPath = async () => {
      for (const segments of [[], ['.github'], ['.github', 'instructions'], ['.github', 'instructions', 'evidence-lens.instructions.md']]) {
        try { if ((await lstat(join(folder.uri.fsPath, ...segments))).isSymbolicLink()) throw new Error('The proposed instruction path is a link. Choose an ordinary scoped workspace instead.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    };
    await checkPath();
    let before = '';
    let exists = false;
    try {
      const stat = await vscode.workspace.fs.stat(target);
      if (stat.size > 32000) throw new Error('The existing instruction exceeds the 32,000-byte review limit.');
      before = decoder.decode(await vscode.workspace.fs.readFile(target)); exists = true;
    } catch (error) { if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error; }
    const rule = '## Evidence-bound completion\n\n- Bind each completion claim to an explicitly linked result and the exact captured code version or resource scope.\n- Rerun relevant validation after the final edit. Earlier passing tests do not prove the new version.\n- Keep denied, missing, or scope-mismatched results unresolved rather than claiming success or failure.\n- Include unresolved checks in handoffs. Never infer hidden reasoning or treat a timeline position as restorable runtime state.\n';
    const after = before ? `${before.trimEnd()}\n\n${rule}` : `---\ndescription: Evidence-bound completion for this workspace\napplyTo: "**/*"\n---\n\n${rule}`;
    if (after.length > 32000) throw new Error('The proposed instruction exceeds the review-size limit.');
    const baseHash = hash(before);
    const left = await this.reviews.document('before.md', before || '(new file)');
    const right = await this.reviews.document('proposed.md', after);
    await vscode.commands.executeCommand('vscode.diff', left.uri, right.uri, `Review workspace rule: ${relative}`, { preview: true });
    const approved = await vscode.window.showWarningMessage('Apply this reviewed rule to this workspace only?', { modal: true,
      detail: `Workspace: ${folder.name}\nTarget: ${relative}\nScope: all files in this workspace only, when the client supports .github/instructions.\n\nReview the displayed diff. This is a proposed rule, not automatic learning. Existing content is preserved and concurrent edits will block the write.` }, 'Apply reviewed rule');
    if (approved !== 'Apply reviewed rule') return;
    await checkPath();
    if (exists) {
      const document = await vscode.workspace.openTextDocument(target);
      if (document.isDirty || hash(document.getText()) !== baseHash ||
          hash(decoder.decode(await vscode.workspace.fs.readFile(target))) !== baseHash) throw new Error('The instruction changed during review. Nothing was written; create and review a new proposal.');
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      const version = document.version;
      if (hash(document.getText()) !== baseHash || document.isDirty || document.version !== version) throw new Error('The instruction changed before editing. Review again.');
      const applied = await editor.edit(builder => builder.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), after));
      if (!applied || !(await document.save())) throw new Error('The reviewed edit could not be applied or saved. Inspect the editor; no overwrite retry was attempted.');
    } else {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.github', 'instructions'));
      const edit = new vscode.WorkspaceEdit(); edit.createFile(target, { overwrite: false, ignoreIfExists: false, contents: encoder.encode(after) });
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error('The new instruction file could not be created, or another edit created it first.');
    }
    await this.artifact('instruction-proposal', 'Explicitly approved workspace rule',
      `Target: ${relative}\nScope: workspace ${folder.name}\nBase digest: ${baseHash}\nApplied digest: ${hash(after)}\n\n${rule}`);
    this.update({ notice: 'Applied the reviewed workspace-scoped instruction. It does not change earlier recordings or guarantee another agent uses it.' });
  }
  async smokeTest() {
    if (this.context.extensionMode !== vscode.ExtensionMode.Test) throw new Error('The isolated smoke entry point is available only in the VS Code test host.');
    console.log('EVIDENCE_LENS_SMOKE stage=encrypted-worker');
    await this.settings({ ...defaultSettings, consent: true });
    await this.apply('example', { scenarioId: 'stale', consent: true });
    const first = this.state.selected!.recording;
    const finding = this.state.assessment!.findings[0];
    const checkpoint = first.events.find(event => event.checkpoint)!;
    await this.apply('plan', { findingId: finding.id, checkpointId: checkpoint.id, fresh: false });
    await this.apply('execute', { planId: this.state.plan!.id, approved: true, consent: true });
    const comparison = this.state.comparison;
    console.log('EVIDENCE_LENS_SMOKE stage=selected-task');
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !vscode.workspace.isTrusted) throw new Error('The isolated smoke test requires its explicitly created trusted fixture workspace.');
    const node = process.env.AFR_TEST_NODE_EXECUTABLE;
    if (!node) throw new Error('The isolated test driver must supply its installed Node executable.');
    const task = new vscode.Task({ type: 'process' }, folder, 'Synthetic exit-zero validation', 'Evidence Lens test',
      new vscode.ProcessExecution(node, ['-e', 'process.exit(0)']));
    const captured = await captureTask(task, folder);
    await this.apply('import', { recording: captured, captureContent: false, consent: true });
    const capturedTaskVerdict = this.state.assessment?.findings[0]?.verdict;
    console.log('EVIDENCE_LENS_SMOKE stage=restart-and-key-loss');
    this.disconnectWorker();
    await this.worker();
    const savedKey = await this.context.secrets.get(this.keyId);
    await this.context.secrets.delete(this.keyId);
    this.disconnectWorker();
    let keyLossRejected = false;
    try { await this.worker(); } catch (error) { keyLossRejected = message(error).includes('key is missing'); }
    if (!savedKey) throw new Error('The test host failed to persist its SecretStorage key.');
    await this.context.secrets.store(this.keyId, savedKey);
    await this.worker();
    const vaultFiles = await readdir(join(this.context.globalStorageUri.fsPath, 'encrypted-vault'));
    const recorderPid = (await this.worker()).processId;
    return { workerSeparateProcess: recorderPid !== null && recorderPid !== process.pid, keyInSecretStorage: Boolean(await this.context.secrets.get(this.keyId)),
      vaultFiles, persistedRecords: this.state.recordings.length, comparison, keyLossRejected, capturedTaskVerdict, version: '0.1.0' };
  }
  dispose() { this.panel?.dispose(); this.bridge?.dispose(); }
}
class Launcher implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(item: vscode.TreeItem) { return item; }
  getChildren() {
    return [
      ['Open evidence workbench', 'agentEvidenceLens.open', 'inspect'],
      ['Try a local example', 'agentEvidenceLens.example', 'beaker'],
      ['Import a recording', 'agentEvidenceLens.import', 'file-add'],
      ['Run a reviewed Azure demo', 'agentEvidenceLens.liveDemo', 'radio-tower'],
      ['Capture a selected task', 'agentEvidenceLens.captureTask', 'checklist'],
      ['Privacy & source health', 'agentEvidenceLens.privacy', 'shield'],
    ].map(([label, command, icon]) => {
      const item = new vscode.TreeItem(label);
      item.command = { title: label, command }; item.iconPath = new vscode.ThemeIcon(icon);
      return item;
    });
  }
}
export function activate(context: vscode.ExtensionContext) {
  if (context.extension.extensionKind !== vscode.ExtensionKind.UI) {
    throw new Error('Evidence Lens requires the local desktop extension host. Install it locally, not into a remote workspace host.');
  }
  const controller = new Controller(context);
  context.subscriptions.push(controller, vscode.window.registerTreeDataProvider('agentEvidenceLens.launcher', new Launcher()));
  const commands: [string, WorkbenchAction | null][] = [
    ['open', null], ['import', { type: 'import' }], ['example', { type: 'example', scenarioId: 'stale' }],
    ['liveDemo', { type: 'liveDemo', scenarioId: 'stale' }], ['captureTask', { type: 'captureValidation' }], ['privacy', { type: 'privacy' }],
  ];
  for (const [name, action] of commands) context.subscriptions.push(vscode.commands.registerCommand(`agentEvidenceLens.${name}`, async () => {
    controller.open(); if (action) await controller.dispatch(action);
  }));
  return { version: '0.1.0', runIsolatedSmoke: () => controller.smokeTest() };
}
