import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment } from '../server/environment.mjs';
loadLocalEnvironment();
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, AFR_DEV: '1' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: root, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
