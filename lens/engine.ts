import { hash, validateRecording } from './schema.ts';
import type { Assessment, CaptureGap, Finding, LensComparison, LensEvent, LensRecording, Scope, Verdict } from './types.ts';

const fields: (keyof Scope)[] = ['repositoryId', 'codeVersion', 'resourceId', 'environment', 'queryScope', 'suite'];
function evaluateClaim(recording: LensRecording, event: LensEvent): Finding {
  const claim = event.claim!;
  const expectedScope: Scope = { ...event.scope };
  const relevant: (keyof Scope)[] = claim.kind === 'test' ? ['repositoryId', 'codeVersion', 'suite']
    : claim.kind === 'health' ? ['resourceId', 'environment', 'queryScope']
      : claim.kind === 'action' && (event.scope.repositoryId || (!event.scope.resourceId && recording.finalScope.repositoryId))
        ? ['repositoryId', 'codeVersion'] : claim.kind === 'action' ? ['resourceId', 'environment'] : [];
  if (claim.appliesTo === 'final') {
    for (const field of relevant) {
      if (expectedScope[field] === undefined && recording.finalScope[field] !== undefined) expectedScope[field] = recording.finalScope[field];
    }
  }
  const references = claim.evidenceIds.map(id => recording.events.find(item => item.id === id)).filter((item): item is LensEvent => Boolean(item));
  const base = {
    id: `finding:${event.id}`, eventId: event.id, seq: event.seq, claim: claim.text, kind: claim.kind,
    expectedScope, evidenceIds: references.map(item => item.id), observedScopes: references.map(item => item.scope),
  };
  const finding = (verdict: Verdict, reasonCode: string, explanation: string, nextCheck: string): Finding => ({
    ...base, verdict, reasonCode, explanation, nextCheck,
    correction: verdict === 'Supported'
      ? `"${claim.text}" is supported only for the captured scope and version, using ${base.evidenceIds.join(', ')}.`
      : `The captured evidence does not establish "${claim.text}" for the delivered state. ${explanation} Required check: ${nextCheck}`,
  });
  if (!claim.evidenceIds.length || references.length !== claim.evidenceIds.length) {
    return finding('Unsupported', 'MISSING_EVIDENCE_LINK', 'The claim has no complete set of resolvable evidence links.', 'Capture and explicitly link the relevant result; a successful unrelated tool call is not proof.');
  }
  if (references.some(item => item.seq >= event.seq)) {
    return finding('Unverifiable', 'NONCAUSAL_EVIDENCE', 'A claim references a result that was not captured before the claim.', 'Create a new evidence-linked claim after the result has been observed.');
  }
  const candidates = references.filter(item => item.observation?.kind === claim.kind).sort((a, b) => b.seq - a.seq);
  if (!candidates.length) return finding('Unsupported', 'WRONG_EVIDENCE_KIND', 'The referenced event does not contain the required structured result.', 'Capture a compatible test, action, health, or citation result instead of relying on a tool name or HTTP success alone.');
  const applicable = candidates.filter(item => fields.every(field => !expectedScope[field] || item.scope[field] === expectedScope[field]) &&
    relevant.every(field => expectedScope[field] && item.scope[field]));
  const evidence = applicable[0] ?? candidates[0];
  const observed = evidence.observation!;
  if (recording.gaps.some(gap => gap.eventId === evidence.id || gap.eventId === event.id)) {
    return finding('Unverifiable', 'RELEVANT_CAPTURE_GAP', 'A capture gap explicitly affects this claim or its selected evidence.', 'Resolve the linked capture gap and repeat the check before asserting support.');
  }
  if (claim.appliesTo === 'final') for (const field of relevant) {
    if (event.scope[field] && recording.finalScope[field] && event.scope[field] !== recording.finalScope[field]) {
      return finding('Unverifiable', field === 'codeVersion' ? 'STALE_CLAIM_VERSION' : 'CLAIM_FINAL_SCOPE_MISMATCH',
        `The claim's ${field} differs from the captured final state. This does not establish that the final target is broken.`,
        'Validate the final version and intended scope, then issue a claim bound to that result.');
    }
  }
  if (relevant.some(field => !expectedScope[field] || !evidence.scope[field])) {
    return finding('Unverifiable', 'MISSING_SCOPE_OR_VERSION', 'The evidence or claim lacks a required code version, target, environment, or query scope.', 'Capture the missing identity and version at execution time, then repeat the relevant check.');
  }
  for (const field of fields) {
    if (expectedScope[field] && !evidence.scope[field]) return finding('Unverifiable', 'MISSING_SCOPE_OR_VERSION',
      `The result did not capture ${field}.`, `Capture ${field} with a new result for the intended target.`);
    if (expectedScope[field] && evidence.scope[field] !== expectedScope[field]) {
      return finding('Unverifiable', field === 'codeVersion' ? 'STALE_VALIDATION' : 'SCOPE_MISMATCH',
        `${field} differs: evidence is bound to "${evidence.scope[field]}", while the claim requires "${expectedScope[field]}". A mismatch does not prove the final target is broken.`,
        field === 'codeVersion' ? 'Rerun validation against the final code version, not the earlier version.' : 'Repeat the query or action against the exact intended resource, environment, and query scope.');
    }
  }
  if (observed.outcome === 'denied' || observed.outcome === 'unknown') {
    return finding('Unverifiable', 'RESULT_UNAVAILABLE', 'The query was denied or its result is unknown. Access failure is not evidence of service health or successful completion.', 'Obtain authorized access and capture a result for the intended scope.');
  }
  const compatibleOutcomes = { test: ['passed', 'failed'], action: ['succeeded', 'failed'],
    health: ['healthy', 'unhealthy'], citation: ['passed', 'succeeded'] };
  if (!compatibleOutcomes[claim.kind].includes(observed.outcome)) {
    return finding('Unverifiable', 'INCOMPATIBLE_RESULT', 'The structured outcome is not compatible with this evidence kind.', 'Capture a valid outcome for this exact kind of check.');
  }
  if (claim.kind === 'test') {
    if (observed.exitCode === undefined || observed.exitCode === null) return finding('Unverifiable', 'MISSING_TEST_RESULT', 'No reliable test completion status was captured.', 'Capture the actual exit code or an explicit structured test result.');
    if (observed.exitCode !== 0 || (observed.failed ?? 0) > 0 || observed.outcome === 'failed') {
      return finding('Contradicted', 'TEST_RESULT_CONTRADICTION', `The applicable test result has exit code ${observed.exitCode} and ${observed.failed ?? 'unreported'} failing tests.`, 'Fix and rerun the failed validation, or correct the completion claim.');
    }
    if (observed.outcome !== 'passed') return finding('Unverifiable', 'INCONSISTENT_RESULT', 'An exit code alone does not agree with an explicit passed test result.', 'Capture a consistent structured validation result.');
  } else if (claim.kind === 'action' && observed.outcome !== 'succeeded') {
    return finding('Contradicted', 'ACTION_RESULT_CONTRADICTION', 'The applicable recorded action did not succeed.', 'Check the actual action outcome and avoid claiming successful completion.');
  } else if (claim.kind === 'health' && observed.outcome !== 'healthy') {
    return finding('Contradicted', 'HEALTH_RESULT_CONTRADICTION', 'The exact target has an explicitly unhealthy captured result.', 'Investigate the unhealthy result and capture a fresh health check.');
  } else if (claim.kind === 'citation') {
    if (!claim.quote || observed.excerpt === undefined || !observed.sourceId || !observed.sourceVersion || !observed.excerptHash) {
      return finding('Unverifiable', 'CITATION_CONTENT_UNAVAILABLE', 'The exact quotation, source version, or captured excerpt is unavailable or minimized.', 'With consent, capture the source excerpt and version, then compare the exact quotation.');
    }
    if (hash(observed.excerpt) !== observed.excerptHash) return finding('Unverifiable', 'CITATION_DIGEST_MISMATCH', 'The source excerpt does not match its recorded digest.', 'Capture an intact source excerpt and verify its provenance.');
    if (!observed.excerpt.includes(claim.quote)) return finding('Unsupported', 'QUOTE_NOT_IN_EXCERPT', 'The claimed quotation is not present in the captured source excerpt.', 'Use a quotation actually present in that source version or provide different evidence.');
  }
  return finding('Supported', 'MATCHING_CAPTURED_EVIDENCE',
    claim.kind === 'citation' ? 'The exact quotation occurs in the captured source version. This validates quote fidelity, not broader semantic conclusions.'
      : 'The explicitly linked result matches the captured version, scope, and narrow claim.',
    'No additional check is required for this narrow captured claim. Revalidate after any relevant change.');
}
const safeMarkdown = (value: string) => value.replace(/[\\`*{}\[\]()#+.!|>_-]/g, '\\$&').replace(/</g, '&lt;').replace(/\r?\n/g, ' ');
export function assess(input: unknown): Assessment {
  const recording = validateRecording(input);
  const findings = recording.events.filter(event => event.claim).map(event => evaluateClaim(recording, event));
  const counts: Record<Verdict, number> = { Supported: 0, Contradicted: 0, Unsupported: 0, Unverifiable: 0 };
  findings.forEach(finding => counts[finding.verdict]++);
  const gaps: CaptureGap[] = [...recording.gaps];
  if (!findings.length) gaps.push({ code: 'NO_STRUCTURED_CLAIMS', detail: 'No compatible structured claims were captured. Free-form final answers are not silently interpreted as verified conclusions.' });
  if (recording.contentCapture === 'minimized') gaps.push({ code: 'CONTENT_MINIMIZED', detail: 'Prompt and raw tool content were omitted. Content-dependent checks may be unverifiable.' });
  if (recording.run.status === 'running' || recording.run.status === 'awaiting_approval') gaps.push({ code: 'PARTIAL_RUN', detail: 'This is a snapshot of an unfinished recording.' });
  const manifest = recording.inventory.map(item => ({
    ...item, usedBy: [...new Set([...item.usedBy, ...recording.events.filter(event => event.assetIds.includes(item.id)).map(event => event.id)])],
  }));
  const knownIds = new Set(manifest.map(item => item.id));
  for (const event of recording.events) for (const assetId of event.assetIds) {
    if (!knownIds.has(assetId)) {
      knownIds.add(assetId);
      manifest.push({ id: assetId, name: assetId, kind: 'tool', version: null, available: false,
        usedBy: recording.events.filter(candidate => candidate.assetIds.includes(assetId)).map(candidate => candidate.id) });
    }
  }
  const unknownVersions = manifest.filter(item => item.usedBy.length && !item.version);
  if (unknownVersions.length) gaps.push({ code: 'UNAVAILABLE_VERSIONS', detail: `${unknownVersions.length} used inventory items have unavailable versions. They are not inferred from names.` });
  for (const item of manifest) if (item.usedBy.some(id => !recording.events.some(event => event.id === id))) {
    gaps.push({ code: 'INVENTORY_CAPTURE_GAP', detail: `Inventory item "${item.name}" references activity absent from the captured event stream.` });
  }
  const requiredChecks = [...new Set(findings.filter(finding => finding.verdict !== 'Supported').map(finding => finding.nextCheck))];
  const linkedIds = new Set(findings.flatMap(item => [item.eventId, ...item.evidenceIds]));
  const eventLink = (id: string) => `[step ${recording.events.find(event => event.id === id)?.seq ?? '?'}](#evidence-${id})`;
  const limitation = 'Only observable, authorized, captured evidence is assessed. Checks validate the declared positive assertion kind and scope; arbitrary free-form wording is not independently fact-checked. No hidden reasoning, private Copilot panels, opaque MCP internals, or unrecorded runtime state is inferred.';
  const summary = [
    `# Evidence-linked handoff: ${safeMarkdown(recording.run.name)}`, '',
    `Run: ${recording.run.id}`, `Recording digest: ${recording.integrity.digest}`,
    `Capture: ${gaps.length ? 'partial' : 'bounded to the declared adapter'}; ${recording.contentCapture}.`, '',
    '## Supported conclusions', '',
    ...findings.filter(item => item.verdict === 'Supported').map(item => `- ${safeMarkdown(item.claim)} [claim ${item.eventId}; evidence ${item.evidenceIds.join(', ')}]. ${item.evidenceIds.map(eventLink).join(', ')}`),
    ...(counts.Supported ? [] : ['No supported conclusions are established by the captured structured evidence.']),
    '', '## Unresolved claims', '',
    ...findings.filter(item => item.verdict !== 'Supported').map(item => `- ${item.verdict}: ${safeMarkdown(item.claim)} [claim ${item.eventId}; evidence ${item.evidenceIds.join(', ') || 'missing'}]. ${safeMarkdown(item.explanation)} ${item.evidenceIds.map(eventLink).join(', ')}`),
    '', '## Required checks', '', ...requiredChecks.map(value => `- ${safeMarkdown(value)}`),
    '', '## Capture gaps', '', ...gaps.map(gap => `- ${safeMarkdown(gap.detail)}`),
    '', '## Referenced steps', '',
    ...recording.events.filter(event => linkedIds.has(event.id)).flatMap(event => [
      `<a id="evidence-${event.id}"></a>`, `### Step ${event.seq}: ${safeMarkdown(event.name)}`, '',
      `Event ID: ${event.id}`, `Captured at: ${event.timestamp}`,
      ...Object.entries(event.scope).map(([field, value]) => `- ${field}: ${safeMarkdown(value)}`),
      ...(event.observation ? [`- Result: ${event.observation.kind} / ${event.observation.outcome}`,
        ...(event.observation.exitCode !== undefined ? [`- Exit: ${event.observation.exitCode ?? 'unavailable'}`] : [])] : []), '',
    ]),
    limitation, '',
  ].join('\n');
  return { runId: recording.run.id, counts, findings, manifest, gaps, sources: recording.sources,
    coverage: gaps.length ? 'partial' : 'bounded', requiredChecks, summary, limitation };
}
export function compareEvidence(original: LensRecording, corrected: LensRecording): LensComparison {
  const before = assess(original), after = assess(corrected);
  const keys = [...new Set([...before.findings, ...after.findings].map(item => `${item.kind}:${item.claim}`))];
  return {
    originalId: original.run.id, correctedId: corrected.run.id, linked: corrected.run.parentRunId === original.run.id,
    original: before.counts, corrected: after.counts,
    changes: keys.map(key => {
      const left = before.findings.find(item => `${item.kind}:${item.claim}` === key);
      const right = after.findings.find(item => `${item.kind}:${item.claim}` === key);
      return { claim: (left ?? right)!.claim, before: left?.verdict ?? 'Absent', after: right?.verdict ?? 'Absent' };
    }),
    scopeChanges: fields.filter(field => original.finalScope[field] !== corrected.finalScope[field])
      .map(field => ({ field, before: original.finalScope[field] ?? 'Unavailable', after: corrected.finalScope[field] ?? 'Unavailable' })),
  };
}
