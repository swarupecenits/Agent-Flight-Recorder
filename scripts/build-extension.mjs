import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = join(root, 'extension', 'dist');
await mkdir(outdir, { recursive: true });
await Promise.all([
  build({ absWorkingDir: root, entryPoints: { extension: 'extension/src/extension.ts', worker: 'extension/src/worker.ts', 'test-runner': 'extension/test/run.ts' },
    bundle: true, outdir, platform: 'node', target: 'node20', format: 'cjs', outExtension: { '.js': '.cjs' },
    external: ['vscode'], sourcemap: false, minify: true, legalComments: 'inline', logLevel: 'warning' }),
  build({ absWorkingDir: root, entryPoints: { webview: 'extension/src/webview.tsx' },
    bundle: true, outdir, platform: 'browser', target: 'es2022', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, sourcemap: false, minify: true, legalComments: 'inline', logLevel: 'warning' }),
]);
const notices = await Promise.all(['react', 'react-dom', 'scheduler', 'zod', 'lucide-react'].map(async name =>
  `${name}\n${'='.repeat(name.length)}\n${await readFile(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`));
await writeFile(join(outdir, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'));
console.log('Built extension controller, isolated recorder worker, and shared workbench.');
