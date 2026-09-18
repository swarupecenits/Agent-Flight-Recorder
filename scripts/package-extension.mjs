import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'artifacts', 'agent-evidence-lens-0.1.0.vsix');
await mkdir(join(root, 'artifacts'), { recursive: true });
const { stdout, stderr } = await exec(process.execPath, [join(root, 'node_modules', '@vscode', 'vsce', 'vsce'),
  'package', '--no-dependencies', '--skip-license', '--out', out], { cwd: join(root, 'extension'), timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
console.log(`Local VSIX: ${out}`);
