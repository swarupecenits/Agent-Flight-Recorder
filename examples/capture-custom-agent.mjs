import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { FlightRecorder } from '../sdk/recorder.mjs';
import { loadLocalEnvironment } from '../server/environment.mjs';
loadLocalEnvironment();

const baseUrl = process.env.AFR_URL ?? 'http://127.0.0.1:4180';
const recorder = new FlightRecorder({ baseUrl });
let runId;
const result = await recorder.run({
  name: 'Independent SDK report agent', agentName: 'sdk-report-agent',
  input: { prompt: 'Summarize revenue from the fictional sales fixture.' },
  metadata: { example: 'standalone Node process over HTTP', modelMode: 'deterministic-code', fictionalData: true },
}, async run => {
  runId = run.id;
  await run.prompt('Summarize the fictional report and return total revenue.');
  await run.decision('Read the local JSON fixture through an instrumented tool', { phase: 'reading' });
  const report = await run.tool('ReadSalesFixture', { file: 'examples/fixtures/quarterly-sales.json' }, async () =>
    JSON.parse(await readFile(new URL('./fixtures/quarterly-sales.json', import.meta.url), 'utf8')));
  const total = await run.tool('SumRevenue', { regions: report.sales }, async () =>
    report.sales.reduce((sum, row) => sum + row.revenue, 0));
  await run.decision('Return the computed total with its source title', { totalRevenue: total, source: report.title });
  return { title: report.title, totalRevenue: total, currency: report.currency, fictional: true };
});
const response = await fetch(`${baseUrl}/api/runs/${runId}/export?format=json`);
if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/independent-sdk-recording.json', import.meta.url), await response.text(), 'utf8');
console.log(JSON.stringify({ runId, view: `${baseUrl}/#/runs/${runId}`, result,
  saved: 'artifacts\\independent-sdk-recording.json' }, null, 2));
