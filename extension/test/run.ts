import * as vscode from 'vscode';
import assert from 'node:assert/strict';

export async function run() {
  console.log('EVIDENCE_LENS_SMOKE stage=activation');
  const extension = vscode.extensions.getExtension<{ version: string; runIsolatedSmoke: () => Promise<{
    workerSeparateProcess: boolean; keyInSecretStorage: boolean; vaultFiles: string[];
    persistedRecords: number; keyLossRejected: boolean; capturedTaskVerdict: string;
    comparison: { linked: boolean; changes: { before: string; after: string }[] };
  }> }>('swarupecenits.agent-evidence-lens');
  assert.ok(extension, 'The actual development extension must be loaded.');
  assert.equal(extension.extensionKind, vscode.ExtensionKind.UI, 'The vault and collector client must stay in the local desktop host.');
  const api = await extension.activate();
  assert.equal(api.version, '0.1.0');
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['open', 'import', 'example', 'liveDemo', 'captureTask', 'privacy']) assert.ok(commands.includes(`agentEvidenceLens.${name}`));
  const result = await api.runIsolatedSmoke();
  assert.equal(result.workerSeparateProcess, true);
  assert.equal(result.keyInSecretStorage, true);
  assert.ok(result.persistedRecords >= 3);
  assert.equal(result.keyLossRejected, true);
  assert.equal(result.capturedTaskVerdict, 'Supported');
  assert.ok(result.vaultFiles.every(name => /^[a-f0-9-]{36}\.lens\.enc$/.test(name)));
  assert.equal(result.comparison.linked, true);
  assert.deepEqual(result.comparison.changes.map(item => [item.before, item.after]), [['Unverifiable', 'Supported']]);
  console.log('EVIDENCE_LENS_EXTENSION_SMOKE_OK ' + JSON.stringify(result));
}
