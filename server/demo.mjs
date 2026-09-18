import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { FlightRecorder, describeError } from '../sdk/recorder.mjs';
import { canonical, TERMINAL_STATUSES } from '../shared/trace.mjs';
import { HttpError } from './schemas.mjs';

const fixtureRoot = fileURLToPath(new URL('../examples/fixtures/', import.meta.url));
const catalog = {
  'quarterly-sales': { filename: 'quarterly-sales.json', title: 'Northstar quarterly sales', classification: 'internal' },
  'restricted-board': { filename: 'restricted-board-report.json', title: 'Restricted board report', classification: 'restricted' },
  'broken-report': { filename: 'broken-report.txt', title: 'Intentionally malformed report', classification: 'internal' },
};
export const policies = [
  { id: 'POL-READ-INTERNAL', name: 'Allow sandbox report reads', outcome: 'allow', tool: 'FileSearchTool / ReadFileTool', description: 'Search the fixed fictional catalog and read internal demo reports only. Arbitrary filesystem paths are never accepted.' },
  { id: 'POL-READ-RESTRICTED', name: 'Block restricted documents', outcome: 'deny', tool: 'ReadFileTool', description: 'A restricted classification blocks the read before the tool callback runs. No restricted content is captured.' },
  { id: 'POL-SEND-EXTERNAL', name: 'Human review for external recipients', outcome: 'require_approval', tool: 'SendEmailTool', description: 'Recipients outside contoso.example need an explicit local review of the exact message. Even approved actions write only to the local outbox.' },
  { id: 'POL-SEND-INTERNAL', name: 'Allow internal sandbox receipts', outcome: 'allow', tool: 'SendEmailTool', description: 'Recipients in contoso.example may receive a local outbox receipt. There is no SMTP, Graph, or network email integration.' },
  { id: 'POL-DEFAULT-DENY', name: 'Deny unknown tools', outcome: 'deny', tool: 'Any unknown tool', description: 'The demo runner executes only its three allowlisted sandbox tools. These local rules do not govern arbitrary external agents.' },
];
export const scenarios = [
  { id: 'approval', name: 'Human in the loop', description: 'Summarize the sales report and request approval before creating an external-recipient sandbox receipt.', expectedStatus: 'awaiting_approval', faultInjection: null },
  { id: 'retry', name: 'Recover from a transient error', description: 'Observe one explicitly injected read failure, a real retry, and successful report processing.', expectedStatus: 'completed', faultInjection: 'One DEMO_TRANSIENT exception before the first report read; the second attempt reads the real fixture.' },
  { id: 'blocked', name: 'Policy stops a restricted read', description: 'Request the restricted board report. The read is denied before the tool executes.', expectedStatus: 'blocked', faultInjection: null },
  { id: 'failure', name: 'Debug a persistent failure', description: 'A deliberately malformed fixture causes two real JSON parse failures, then a failed run.', expectedStatus: 'failed', faultInjection: 'The input fixture contains intentionally invalid JSON. The read is retried once.' },
  { id: 'success', name: 'Clean baseline', description: 'Search, read, summarize, and save an internal-recipient receipt without failures.', expectedStatus: 'completed', faultInjection: null },
];
export function evaluatePolicy(tool, input) {
  let id;
  if (tool === 'FileSearchTool') id = 'POL-READ-INTERNAL';
  else if (tool === 'ReadFileTool') {
    id = !Object.hasOwn(catalog, input?.fileId) ? 'POL-DEFAULT-DENY' : catalog[input.fileId].classification === 'restricted' ? 'POL-READ-RESTRICTED' : 'POL-READ-INTERNAL';
  } else if (tool === 'SendEmailTool') {
    id = typeof input?.recipient === 'string' && /^[^@\s]+@contoso\.example$/i.test(input.recipient) ? 'POL-SEND-INTERNAL' : 'POL-SEND-EXTERNAL';
  } else id = 'POL-DEFAULT-DENY';
  const policy = policies.find(value => value.id === id);
  return { policyId: id, outcome: policy.outcome, reason: policy.description };
}
const reportSchema = z.object({
  title: z.string(), period: z.string(), fictional: z.literal(true), currency: z.literal('USD'),
  previousQuarterTotal: z.number().positive(),
  sales: z.array(z.object({ region: z.string(), revenue: z.number().nonnegative(), deals: z.number().int().nonnegative() })).min(1),
});
export function localTransport(store, options = {}) {
  return {
    createRun: input => store.createRun(input, options),
    append: (id, token, event) => store.capture(id, token, [event])[0],
    finish: (id, token, result) => store.finish(id, token, result),
  };
}
export class DemoRunner {
  constructor(store) { this.store = store; this.active = new Map(); this.closing = false; }
  track(id, operation) {
    const guarded = operation.catch(error => {
      console.error(`[Agent Flight Recorder] Sandbox recording ${id} failed:`, describeError(error));
      throw error;
    });
    this.active.set(id, guarded);
    // The tracked rejection is logged; callers waiting for shutdown still receive it.
    guarded.then(() => this.active.delete(id), () => this.active.delete(id));
  }
  async idle() {
    const results = await Promise.allSettled([...this.active.values()]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Sandbox tasks did not finish cleanly.');
  }
  async start({ scenarioId, name }, parentRunId = null) {
    if (this.closing) throw new HttpError(503, 'SHUTTING_DOWN', 'The recorder is shutting down.');
    if (this.active.size >= 8) throw new HttpError(429, 'DEMO_CONCURRENCY_LIMIT', 'Wait for an active sandbox run to finish before starting another.');
    const scenario = scenarios.find(value => value.id === scenarioId);
    if (!scenario) throw new HttpError(422, 'UNKNOWN_SCENARIO', 'Select a supported demo scenario.');
    if (parentRunId && this.store.run(parentRunId).origin !== 'demo') throw new HttpError(422, 'RERUN_NOT_SUPPORTED', 'Only a sandbox demo can be re-executed here. Replay imported and SDK recordings without executing their code.');
    const recorder = new FlightRecorder({ transport: localTransport(this.store, { origin: 'demo', scenarioId, parentRunId }) });
    const prompt = scenarioId === 'blocked' ? 'Summarize the restricted board report.' : 'Summarize the quarterly sales report and share the key findings.';
    const run = await recorder.startRun({ name: name ?? scenario.name, agentName: 'northstar-report-agent',
      input: { prompt }, metadata: { modelMode: 'scripted-demo', fictionalData: true, scenarioId,
        faultInjection: scenario.faultInjection, provider: 'local deterministic formatter', sandboxOnly: true } });
    this.track(run.id, this.execute(run, scenarioId, prompt));
    return { runId: run.id };
  }
  async execute(run, scenarioId, prompt) {
    try {
      await run.prompt(prompt);
      await run.decision('Search the allowlisted report catalog', { phase: 'searching', request: prompt });
      const searchInput = { query: 'report', catalog: 'fictional-demo-fixtures' };
      await run.policy('FileSearchTool', evaluatePolicy('FileSearchTool', searchInput), searchInput);
      const found = await run.tool('FileSearchTool', searchInput, async () => {
        const files = await readdir(fixtureRoot);
        return Object.entries(catalog).filter(([, file]) => files.includes(file.filename))
          .map(([fileId, file]) => ({ fileId, title: file.title, classification: file.classification }));
      });
      const fileId = scenarioId === 'blocked' ? 'restricted-board' : scenarioId === 'failure' ? 'broken-report' : 'quarterly-sales';
      if (!found.some(file => file.fileId === fileId)) throw new Error('The required demo fixture is missing from the catalog.');
      await run.decision('Select the report matching this demo scenario', { selectedFile: fileId, phase: 'reading' });
      const readInput = { fileId };
      const readPolicy = evaluatePolicy('ReadFileTool', readInput);
      await run.policy('ReadFileTool', readPolicy, readInput);
      if (readPolicy.outcome !== 'allow') {
        await run.finish({ status: 'blocked', output: { message: 'The restricted report was not read.', reason: readPolicy.reason } });
        return;
      }
      let attempt = 0;
      const report = await run.tool('ReadFileTool', readInput, async () => {
        attempt += 1;
        if (scenarioId === 'retry' && attempt === 1) {
          throw Object.assign(new Error('Explicit demo fault: one transient report-read failure.'), { code: 'DEMO_TRANSIENT' });
        }
        const text = await readFile(join(fixtureRoot, catalog[fileId].filename), 'utf8');
        return reportSchema.parse(JSON.parse(text));
      }, { attempts: scenarioId === 'retry' || scenarioId === 'failure' ? 2 : 1,
        retryDelayMs: 80, attributes: { sandbox: true, faultInjection: scenarioId === 'retry' || scenarioId === 'failure' } });
      await run.decision('Compute an evidence-based summary from the report rows', { phase: 'summarizing', reportTitle: report.title });
      const summary = await run.model('ScriptedReportFormatter', { report, instructions: 'Compute total revenue, growth, deals and strongest region.' }, async () => {
        const totalRevenue = report.sales.reduce((sum, row) => sum + row.revenue, 0);
        const deals = report.sales.reduce((sum, row) => sum + row.deals, 0);
        const growthPercent = Math.round((totalRevenue / report.previousQuarterTotal - 1) * 1000) / 10;
        const strongestRegion = [...report.sales].sort((a, b) => b.revenue - a.revenue)[0].region;
        return { title: report.title, totalRevenue, currency: report.currency, deals, growthPercent, strongestRegion,
          text: `${report.period} revenue was $${totalRevenue.toLocaleString('en-US')}, up ${growthPercent}% versus the previous quarter, across ${deals} deals. ${strongestRegion} was the largest region.`,
          generatedBy: 'Deterministic local code, not a language model', fictional: true };
      }, { attributes: { mode: 'scripted-demo', provider: 'local', tokenUsage: 'not-applicable' } });
      await run.decision('Check the recipient policy before creating any outbound receipt', { phase: 'policy-check', summary });
      const message = { recipient: scenarioId === 'approval' ? 'reviewer@external.example' : 'analyst@contoso.example',
        subject: report.title, body: summary.text };
      const sendPolicy = evaluatePolicy('SendEmailTool', message);
      await run.policy('SendEmailTool', sendPolicy, message);
      if (sendPolicy.outcome === 'require_approval') {
        this.store.requestApproval(run.id, run.writeToken, { tool: 'SendEmailTool', ...sendPolicy, input: message });
        return;
      }
      await this.send(run, message);
    } catch (error) {
      if (!TERMINAL_STATUSES.has(this.store.run(run.id).status)) {
        await run.finish({ status: 'failed', error: describeError(error) });
      }
    }
  }
  async send(run, message, approval) {
    const policy = evaluatePolicy('SendEmailTool', message);
    if (policy.outcome !== 'allow') {
      const persisted = approval && this.store.approvals(run.id).find(value => value.id === approval.id);
      if (policy.outcome !== 'require_approval' || !persisted || persisted.status !== 'approved' ||
          persisted.policyId !== policy.policyId || canonical(persisted.input) !== canonical(message)) {
        throw new HttpError(403, 'APPROVAL_REQUIRED', 'The exact sandbox message must be approved before execution.');
      }
      await run.policy('SendEmailTool', { ...policy, outcome: 'allow', originalOutcome: 'require_approval',
        reason: 'The local reviewer approved this exact message.', approvalId: persisted.id, actor: persisted.actor }, message);
    }
    const receipt = await run.tool('SendEmailTool', message, async () => {
      await delay(25);
      return this.store.deliver(run.id, message);
    }, { attributes: { sandboxOnly: true, channel: 'local-outbox', demoDelayMs: 25 } });
    await run.decision('Return the sandbox receipt and finish the recorded execution', { phase: 'complete', deliveryId: receipt.id });
    await run.finish({ status: 'completed', output: { summary: message.body, receiptId: receipt.id,
      channel: 'local-outbox', message: 'Saved a local sandbox receipt. No real email was sent.' } });
  }
  async resolve(approvalId, decision) {
    if (this.closing) throw new HttpError(503, 'SHUTTING_DOWN', 'The recorder is shutting down.');
    const claimed = this.store.claimApproval(approvalId, decision);
    if (claimed.duplicate) return { runId: claimed.approval.runId };
    const recorder = new FlightRecorder({ transport: localTransport(this.store) });
    const run = recorder.resume(claimed.credentials);
    const operation = async () => {
      try {
        if (decision.decision === 'reject') {
          await run.policy('SendEmailTool', { outcome: 'deny', policyId: claimed.approval.policyId,
            reason: 'The local reviewer rejected the outbound sandbox action.', actor: decision.actor }, claimed.approval.input);
          await run.finish({ status: 'blocked', output: { message: 'The action was rejected. No outbox receipt was created.' } });
        } else await this.send(run, claimed.approval.input, claimed.approval);
      } catch (error) {
        if (!TERMINAL_STATUSES.has(this.store.run(run.id).status)) await run.finish({ status: 'failed', error: describeError(error) });
      }
    };
    this.track(run.id, operation());
    return { runId: run.id };
  }
}
