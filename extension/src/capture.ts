import * as vscode from 'vscode';
import { addEvent, newRecording, seal, validateRecording } from '../../lens/schema.ts';
import { snapshotWorkspace } from '../../lens/workspace.ts';
import type { LensRecording } from '../../lens/types.ts';

export function describeTask(task: vscode.Task): string {
  const execution = task.execution;
  if (execution instanceof vscode.ShellExecution) {
    return execution.commandLine || [typeof execution.command === 'string' ? execution.command : execution.command.value,
      ...execution.args.map(arg => typeof arg === 'string' ? arg : arg.value)].join(' ');
  }
  if (execution instanceof vscode.ProcessExecution) return [execution.process, ...execution.args].join(' ');
  return `Provider-defined task: ${task.name}. Its command will be resolved by ${task.source}.`;
}
function dirty(folder: vscode.WorkspaceFolder) {
  return vscode.workspace.textDocuments.filter(document => document.isDirty &&
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === folder.uri.toString()).map(document => document.uri.toString());
}
export async function captureTask(task: vscode.Task, folder: vscode.WorkspaceFolder, token?: vscode.CancellationToken): Promise<LensRecording> {
  if (folder.uri.scheme !== 'file') throw new Error('Task fingerprint capture currently requires a local filesystem workspace.');
  if (task.isBackground) throw new Error('Choose a foreground validation task with a completion boundary, not a server or watcher.');
  const before = await snapshotWorkspace(folder.uri.fsPath, dirty(folder));
  const recording = newRecording(`Validation: ${task.name}`.slice(0, 240), 'selected-vscode-task', 'live');
  recording.adapter = { id: 'vscode-task', version: 1, mode: 'live' };
  recording.finalScope = before.scope;
  recording.gaps.push(...before.gaps,
    { code: 'TASK_EXIT_ONLY', detail: 'Public task events capture the exit status, not terminal output, test counts, private agent messages, or opaque child/runtime state. A task-completion claim is not an all-tests-passed claim.' },
    { code: 'ADAPTER_CANDIDATE_CLAIM', detail: 'The opted-in adapter creates a narrow candidate completion statement to check. It is not an intercepted agent final answer or a claim attributed to a private Chat conversation.' });
  recording.sources = [{ id: 'vscode-task', version: 'public-api-v1', status: 'capturing',
    detail: 'Only the explicitly selected task execution is observed. Its command may have real effects; this capture adapter is not a sandbox.',
    capabilities: ['selected-task-exit', 'bounded-workspace-version'] }];
  const start = addEvent(recording, { type: 'run.started', name: 'Observe the explicitly approved task', scope: before.scope });
  const snapshot = addEvent(recording, { type: 'context.snapshot', name: `Before validation: ${before.fileCount} fingerprinted files`, scope: before.scope, parents: [start.id], assetIds: [before.scope.repositoryId!] });
  const operation = addEvent(recording, { type: 'tool.started', name: task.name.slice(0, 240), scope: before.scope, parents: [snapshot.id], assetIds: ['selected-task'] });
  recording.inventory = [
    { kind: 'agent', id: 'selected-vscode-task', name: 'Public VS Code task adapter', version: '1', available: true, usedBy: [start.id] },
    { kind: 'repository', id: before.scope.repositoryId!, name: folder.name, version: before.scope.codeVersion ?? null, available: true, usedBy: [snapshot.id] },
    { kind: 'tool', id: 'selected-task', name: task.name.slice(0, 240), version: 'public-vscode-task-api-v1', available: true, usedBy: [operation.id] },
    ...before.instructionVersions.slice(0, 100).map(item => ({ kind: 'instruction' as const, id: item.path, name: item.path, version: item.version, available: true, usedBy: [] })),
  ];
  let execution: vscode.TaskExecution | undefined;
  const earlyExit = new Map<vscode.TaskExecution, number | undefined>();
  const earlyEnd = new Set<vscode.TaskExecution>();
  let settle: (value: { exit: number | undefined; reason: string | null }) => void = () => {};
  const completed = new Promise<{ exit: number | undefined; reason: string | null }>(resolve => { settle = resolve; });
  const cleanup: vscode.Disposable[] = [];
  let endTimer: NodeJS.Timeout | undefined;
  const end = (which: vscode.TaskExecution) => {
    if (execution !== which) { earlyEnd.add(which); return; }
    endTimer = setTimeout(() => settle({ exit: undefined, reason: 'The task ended without a public process exit code.' }), 200);
  };
  cleanup.push(vscode.tasks.onDidEndTaskProcess(event => {
    if (event.execution === execution) settle({ exit: event.exitCode, reason: event.exitCode === undefined ? 'No process exit code was available.' : null });
    else earlyExit.set(event.execution, event.exitCode);
  }), vscode.tasks.onDidEndTask(event => end(event.execution)));
  if (token) cleanup.push(token.onCancellationRequested(() => settle({ exit: undefined, reason: 'Observation was cancelled. The selected task was not automatically terminated.' })));
  const timeout = setTimeout(() => settle({ exit: undefined, reason: 'The 10-minute observation limit was reached. The task may still be running and was not automatically terminated.' }), 600000);
  let outcome: { exit: number | undefined; reason: string | null };
  try {
    Promise.resolve(vscode.tasks.executeTask(task)).then(value => {
      execution = value;
      if (earlyExit.has(value)) settle({ exit: earlyExit.get(value), reason: null });
      else if (earlyEnd.has(value)) end(value);
    }, error => settle({ exit: undefined, reason: `The selected task could not start: ${error instanceof Error ? error.name : 'unknown failure'}. Check the VS Code task notification.` }));
    if (token?.isCancellationRequested) settle({ exit: undefined, reason: 'Observation was cancelled; the task itself may continue.' });
    outcome = await completed;
  } catch (error) {
    outcome = { exit: undefined, reason: `The selected task could not be observed: ${error instanceof Error ? error.name : 'unknown failure'}. Check the VS Code task notification.` };
  } finally {
    clearTimeout(timeout); if (endTimer) clearTimeout(endTimer); cleanup.forEach(item => item.dispose());
  }
  const after = await snapshotWorkspace(folder.uri.fsPath, dirty(folder));
  recording.finalScope = after.scope;
  const result = addEvent(recording, { type: 'tool.result', name: outcome.exit === undefined ? 'Task outcome unavailable' : `Task exited with code ${outcome.exit}`,
    parents: [operation.id], scope: before.scope, assetIds: ['selected-task'],
    observation: { kind: 'action', outcome: outcome.exit === undefined ? 'unknown' : outcome.exit === 0 ? 'succeeded' : 'failed', exitCode: outcome.exit ?? null } });
  if (outcome.reason) recording.gaps.push({ code: 'TASK_OUTCOME_UNAVAILABLE', detail: outcome.reason, eventId: result.id });
  if (!before.scope.codeVersion || !after.scope.codeVersion) recording.gaps.push({ code: 'VERSION_CAPTURE_INCOMPLETE', detail: 'A complete before/after workspace fingerprint was not captured.', eventId: result.id });
  if (before.scope.codeVersion !== after.scope.codeVersion) recording.gaps.push({ code: 'WORKSPACE_CHANGED_DURING_TASK', detail: 'The declared working-file set changed during validation. Its result cannot be bound reliably to the final version.', eventId: result.id });
  recording.gaps.push(...after.gaps.filter(gap => !recording.gaps.some(existing => existing.code === gap.code)));
  addEvent(recording, { type: 'context.snapshot', name: `After validation: ${after.fileCount} fingerprinted files`, scope: after.scope, parents: [result.id], assetIds: [before.scope.repositoryId!] });
  addEvent(recording, { type: 'claim', name: 'Adapter-generated task-completion check', scope: after.scope, parents: [result.id],
    claim: { kind: 'action', text: 'The selected validation task completed successfully for the captured final file set.', appliesTo: 'final', evidenceIds: [result.id] } });
  addEvent(recording, { type: 'run.finished', name: 'Task observation finished', scope: after.scope });
  recording.run.status = outcome.exit === undefined ? 'interrupted' : outcome.exit === 0 ? 'completed' : 'failed';
  recording.run.endedAt = new Date().toISOString();
  return validateRecording(seal(recording));
}
