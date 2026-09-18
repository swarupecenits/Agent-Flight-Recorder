import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.env.VSCODE_EXECUTABLE,
  process.platform === 'win32' ? 'C:\\Program Files\\Microsoft VS Code\\Code.exe' : undefined,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe') : undefined].filter(Boolean);
const executable = candidates.find(path => existsSync(path));
if (!executable) throw new Error('Set VSCODE_EXECUTABLE to an installed VS Code desktop executable. This test never downloads or replaces your editor.');
const directory = await mkdtemp(join(tmpdir(), 'afr-vscode-test-'));
const workspace = join(directory, 'workspace');
const userData = join(directory, 'profile');
await mkdir(workspace);
await mkdir(join(userData, 'User'), { recursive: true });
await writeFile(join(workspace, 'fixture.js'), 'export const fixture = "synthetic VS Code task capture";\n');
await writeFile(join(userData, 'User', 'settings.json'), JSON.stringify({
  'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false,
  'extensions.autoCheckUpdates': false, 'chat.disableAIFeatures': true,
  'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false,
}));
await promisify(execFile)('git', ['init', '--quiet', workspace], { windowsHide: true });
const args = [`--extensionDevelopmentPath=${join(root, 'extension')}`, `--extensionTestsPath=${join(root, 'extension', 'dist', 'test-runner.cjs')}`,
  `--user-data-dir=${userData}`, `--extensions-dir=${join(directory, 'extensions')}`, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--new-window', workspace];
const env = { ...process.env, AFR_TEST_NODE_EXECUTABLE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
let succeeded = false;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`VS Code smoke test timed out. Isolated diagnostic profile: ${directory}`)); }, 180000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', (code, signal) => { clearTimeout(timer); code === 0 ? resolve(code) : reject(new Error(`VS Code test host exited ${code ?? signal}. Diagnostics are in ${directory}.`)); });
  });
  succeeded = code === 0;
  console.log('Actual VS Code host, SecretStorage, separate encrypted worker, task capture and recovery completed.');
} finally {
  if (succeeded) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
