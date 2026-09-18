import { createApplication } from './app.mjs';
import { loadLocalEnvironment } from './environment.mjs';

loadLocalEnvironment();
const port = Number(process.env.AFR_PORT ?? 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AFR_PORT must be an integer between 1024 and 65535.');
const context = createApplication({ ...(process.env.AFR_DB_PATH ? { databasePath: process.env.AFR_DB_PATH } : {}),
  development: process.env.AFR_DEV === '1' });
const server = context.app.listen(port, '127.0.0.1', () => {
  console.log(`Agent Flight Recorder is ready at http://127.0.0.1:${port}`);
  console.log('Local workspace. Scripted fictional demos. Replay never executes tools. No email is sent.');
});
server.on('error', async error => { console.error(error.message); await context.close(); process.exitCode = 1; });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  context.runner.closing = true;
  try {
    await new Promise(resolve => server.close(resolve));
    await context.close();
  }
  catch (error) { console.error('Recorder shutdown failed:', error); process.exitCode = 1; }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
