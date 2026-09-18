import { createApplication } from '../server/app.mjs';
import { existsSync } from 'node:fs';
import { createFoundryProvider } from '../server/foundry.mjs';

if (!existsSync(new URL('../dist/index.html', import.meta.url))) throw new Error('Build the frontend with npm run build before running browser workflows.');
const app = createApplication({ databasePath: ':memory:', lensProvider: createFoundryProvider({ env: {} }) });
const server = app.app.listen(Number(process.env.AFR_E2E_PORT ?? 4398), '127.0.0.1');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  app.runner.closing = true;
  await new Promise(resolve => server.close(resolve));
  await app.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
