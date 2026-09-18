import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { RunDetail } from '../shared/contracts';

async function detail(page: Page, id: string): Promise<RunDetail> {
  const response = await page.request.get(`/api/runs/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
function currentRun(page: Page) {
  const id = page.url().match(/#\/runs\/([a-f0-9-]+)/)?.[1];
  if (!id) throw new Error(`The UI did not navigate to a recording: ${page.url()}`);
  return id;
}
async function recordDemo(page: Page, scenario: string) {
  await page.goto('/#/');
  await page.getByRole('combobox', { name: /scenario/i }).first().selectOption(scenario);
  await page.getByRole('button', { name: /^Record demo$/i }).first().click();
  await expect(page).toHaveURL(/#\/runs\/[a-f0-9-]+/);
  const id = currentRun(page);
  await expect.poll(async () => (await detail(page, id)).run.status).not.toBe('running');
  return id;
}
function exportJson(page: Page) {
  return page.getByRole('link', { name: /export.*json|^json$/i })
    .or(page.getByRole('button', { name: /export.*json|^json$/i })).first();
}

test('record, replay, approve and download without replay side effects', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await recordDemo(page, 'approval');
  await expect(page.getByRole('heading', { name: 'Human in the loop', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve action', exact: true })).toBeVisible();
  const before = await detail(page, id);
  expect(before.deliveries).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('recorder-approval.png'), fullPage: true });

  const slider = page.getByRole('slider', { name: 'Replay position' });
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await page.getByRole('checkbox', { name: 'Break on errors and policies' }).check();
  await page.getByRole('button', { name: /^Play$|Play replay/i }).click();
  await expect(slider).toHaveValue('4', { timeout: 8_000 });
  await expect(page.getByRole('button', { name: /^Play$|Play replay/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event payload', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recorded state', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Policy Evaluated Policy: FileSearchTool, event 4', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(slider).toHaveValue('5');
  await page.waitForTimeout(2600);
  await expect(slider).toHaveValue('5');
  const afterReplay = await detail(page, id);
  expect(afterReplay.run.rootHash).toBe(before.run.rootHash);
  expect(afterReplay.deliveries).toHaveLength(0);
  expect(afterReplay.approvals[0].status).toBe('pending');
  await page.screenshot({ path: testInfo.outputPath('recorder-replay.png'), fullPage: true });

  await page.getByRole('textbox', { name: /^Reviewer/i }).fill('Browser demo reviewer');
  await page.getByRole('button', { name: 'Approve action', exact: true }).click();
  await expect.poll(async () => (await detail(page, id)).run.status).toBe('completed');
  const completed = await detail(page, id);
  expect(completed.deliveries).toHaveLength(1);
  expect(completed.integrity.valid).toBe(true);
  expect(completed.approvals[0].actor).toBe('Browser demo reviewer');
  await expect(page.getByRole('checkbox', { name: 'Run Completed', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^Run Completed Run completed, event/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local outbox receipts', exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await exportJson(page).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('browser-approved-recording.json');
  await download.saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.format).toBe('agent-flight-recorder');
  expect(saved.header.id).toBe(id);
  expect(saved.rootHash).toBe(completed.run.rootHash);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Human in the loop', exact: true })).toBeVisible();
  expect((await detail(page, id)).deliveries).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('recorder-completed.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('debug retries, compare a what-if run, block a read and use the mobile workbench', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = await recordDemo(page, 'retry');
  expect((await detail(page, original)).run.metrics.retries).toBe(1);
  await page.getByRole('button', { name: /Retry ReadFileTool/i }).click();
  await expect(page.getByRole('heading', { name: 'Event payload', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('recorder-retry.png'), fullPage: true });

  await page.getByRole('combobox', { name: 'Scenario for rerun', exact: true }).selectOption('success');
  await page.getByRole('button', { name: 'Start rerun', exact: true }).click();
  await expect.poll(() => currentRun(page)).not.toBe(original);
  const fork = currentRun(page);
  await expect.poll(async () => (await detail(page, fork)).run.status).toBe('completed');
  expect((await detail(page, fork)).run.parentRunId).toBe(original);
  await page.getByRole('combobox', { name: 'Comparison run', exact: true }).selectOption(original);
  await expect(page.getByText('Tool path', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('recorder-comparison.png'), fullPage: true });

  const blocked = await recordDemo(page, 'blocked');
  const denied = await detail(page, blocked);
  expect(denied.run.status).toBe('blocked');
  expect(denied.deliveries).toHaveLength(0);
  expect(denied.events.some(event => event.name === 'ReadFileTool' && event.type === 'tool.started')).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Policy stops a restricted read', exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 2);
  await page.screenshot({ path: testInfo.outputPath('recorder-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('import real downloads, reject malformed JSON, render captured text inertly and navigate supporting pages', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const importRunId = await recordDemo(page, 'success');
  const exported = await page.request.get(`/api/runs/${importRunId}/export?format=json`);
  expect(exported.ok()).toBeTruthy();
  const recordingFile = await exported.body();
  await page.goto('/#/');
  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toHaveAccessibleName(/import|recording/i);
  await fileInput.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{not-json') });
  await page.getByRole('button', { name: 'Import recording JSON', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await fileInput.setInputFiles({ name: 'recording.json', mimeType: 'application/json', buffer: recordingFile });
  await page.getByRole('button', { name: 'Import recording JSON', exact: true }).click();
  await expect(page).toHaveURL(/#\/runs\/[a-f0-9-]+/);
  await expect(page.getByRole('heading', { name: 'Clean baseline', exact: true })).toBeVisible();
  expect(currentRun(page)).toBe(importRunId);

  const response = await page.request.post('/api/capture/runs', {
    headers: { 'X-AFR-Client': 'sdk' },
    data: { name: '<img src=x onerror="window.afrInjected=1">', agentName: 'inert-text-client', input: { prompt: '<script>window.afrInjected=1</script>' } },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.request.post(`/api/capture/runs/${run.runId}/finish`, {
    headers: { 'X-AFR-Client': 'sdk', 'X-AFR-Write-Token': run.writeToken },
    data: { output: '<script>window.afrInjected=1</script>', status: 'completed' },
  });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '<img src=x onerror="window.afrInjected=1">', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: '<img src=x onerror="window.afrInjected=1">', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(run.runId));
  await expect(page.getByRole('heading', { name: '<img src=x onerror="window.afrInjected=1">', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, 'afrInjected'))).toBe(false);

  await page.goto('/#/policies');
  await expect(page.getByText('Block restricted documents', { exact: true })).toBeVisible();
  await page.goto('/#/connect');
  await expect(page.getByText(`${new URL(page.url()).origin}/mcp`, { exact: true }).first()).toBeVisible();
  await expect(page.locator('.code-snippet')).toContainText('import { FlightRecorder }');
  await page.goto('/#/insights');
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: /^Record demo$/i }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('recorder-overview.png'), fullPage: true });
  await page.goto('/#/runs/%E0%A4%A');
  await expect(page.getByRole('alert')).toContainText('malformed');
  expect(errors).toEqual([]);
});

test('live dashboard ingestion and live-update failures are visible without corrupting replay state', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: 'Record demo', exact: true })).toBeVisible();
  const created = await page.request.post('/api/capture/runs', {
    headers: { 'X-AFR-Client': 'sdk' }, data: { name: 'Arrived while dashboard was open', agentName: 'live-client' },
  });
  expect(created.status()).toBe(201);
  const external = await created.json();
  await expect(page.getByRole('heading', { name: 'Arrived while dashboard was open', exact: true })).toBeVisible();
  await page.request.post(`/api/capture/runs/${external.runId}/finish`, {
    headers: { 'X-AFR-Client': 'sdk', 'X-AFR-Write-Token': external.writeToken },
    data: { status: 'completed', output: [] },
  });
  const id = await recordDemo(page, 'approval');
  let failNext = true;
  await page.route(`**/api/runs/${id}`, async route => {
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEMPORARY_TEST_FAILURE', message: 'Live refresh probe' } }) });
    } else await route.continue();
  });
  await expect(page.getByRole('alert')).toContainText('Live updates failed');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const slider = page.getByRole('slider', { name: 'Replay position' });
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Review pending action', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pending approval', level: 3, exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Reject action', exact: true }).click();
  await expect.poll(async () => (await detail(page, id)).run.status).toBe('blocked');
  expect((await detail(page, id)).deliveries).toHaveLength(0);
});
