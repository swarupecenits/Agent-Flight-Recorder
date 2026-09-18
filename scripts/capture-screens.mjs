import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.AFR_URL ?? 'http://127.0.0.1:4180';
const manifest = JSON.parse(await readFile(new URL('../artifacts/demo-workspace.json', import.meta.url), 'utf8'));
const artifacts = resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.AFR_BROWSER,
  headless: true, args: ['--disable-background-networking', '--no-first-run', '--disable-extensions'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.goto(base);
  await page.getByRole('button', { name: 'Record demo', exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, 'recorder-overview.png') });
  const pending = manifest.recordings.find(run => run.scenarioId === 'approval');
  await page.goto(`${base}/#/runs/${pending.id}?event=10`);
  await page.getByRole('heading', { name: 'Recorded state', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Event payload', exact: true }).waitFor();
  await page.locator('.detail-main-grid').screenshot({ path: resolve(artifacts, 'recorder-replay.png') });
  await page.locator('.approval-panel').screenshot({ path: resolve(artifacts, 'recorder-approval.png') });
  await page.goto(`${base}/#/runs/${manifest.approvedRunId}`);
  await page.getByRole('heading', { name: 'Local outbox receipts', exact: true }).waitFor();
  await page.locator('.outbox-panel').screenshot({ path: resolve(artifacts, 'recorder-completed.png') });
  await page.goto(`${base}/#/runs/${manifest.comparison.right.id}`);
  await page.getByRole('combobox', { name: 'Comparison run', exact: true }).selectOption(manifest.comparison.left.id);
  await page.getByText('Tool path', { exact: true }).waitFor();
  await page.locator('.comparison-stack').screenshot({ path: resolve(artifacts, 'recorder-comparison.png') });
  const retry = manifest.recordings.find(run => run.scenarioId === 'retry');
  await page.goto(`${base}/#/runs/${retry.id}?event=11`);
  await page.getByRole('heading', { name: 'Event payload', exact: true }).waitFor();
  await page.locator('.detail-main-grid').screenshot({ path: resolve(artifacts, 'recorder-retry.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Record demo', exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, 'recorder-mobile.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  if (overflow) throw new Error('The real workspace has horizontal overflow at the mobile viewport.');
  console.log('Saved seven screenshots from the actual persistent demonstration workspace. No approvals or tools were executed by screenshot capture.');
} finally {
  await browser.close();
}
