import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Circle, FileInput, LockKeyhole, Pause, Play, Radio, RotateCcw } from 'lucide-react';
import type { Finding, LensSettings, Verdict, WorkbenchAction, WorkbenchState } from '../../lens/types';
import { exampleScenarios, type ExampleId } from '../../lens/catalog';
import { Dialog } from './Dialog';
import { JsonBlock } from './JsonBlock';
import { AppearanceButton } from './Preferences';

const verdictLabels: Record<Verdict, { short: string; action: string }> = {
  Supported: { short: 'The proof holds', action: 'Ready for a handoff' },
  Contradicted: { short: 'The result disagrees', action: 'Correct the claim or fix the result' },
  Unsupported: { short: 'A link is missing', action: 'Capture a result that supports this claim' },
  Unverifiable: { short: 'A fresh check is needed', action: 'Check the final version and exact target' },
};
const tabs = ['Review', 'Timeline', 'Manifest', 'Handoff', 'Compare', 'Recovery', 'Privacy'] as const;
type Tab = typeof tabs[number];
function plainReason(finding: Finding) {
  if (['STALE_VALIDATION', 'STALE_CLAIM_VERSION'].includes(finding.reasonCode)) return 'This check ran before the last code change. It does not tell us whether the final change passes or fails.';
  if (['SCOPE_MISMATCH', 'CLAIM_FINAL_SCOPE_MISMATCH'].includes(finding.reasonCode)) return 'The check and the claim point to different targets. A result for one environment cannot prove another.';
  if (finding.reasonCode === 'MISSING_SCOPE_OR_VERSION') return 'The version or exact target was not captured, so this result cannot safely support the final claim.';
  return finding.explanation;
}
export function VerdictBadge({ verdict }: { verdict: Verdict | 'Absent' }) {
  return <span className={`verdict verdict-${verdict.toLowerCase()}`}>
    {verdict === 'Supported' ? <Check size={13} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
    {verdict}
  </span>;
}
export function PrivacyDialog({ open, settings, onClose, onSave }: {
  open: boolean; settings: LensSettings; onClose: () => void; onSave: (settings: LensSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  return <Dialog title="Choose what gets captured" open={open} onClose={onClose}>
    <p className="muted-text">No private Chat panels, hidden reasoning, or background agent activity is collected. Every external review shows what will leave first.</p>
    <label className="setting-toggle"><input type="checkbox" checked={draft.consent} onChange={event => setDraft({ ...draft, consent: event.target.checked })} />
      <span><strong>Allow local recordings</strong><small>Required to import or create evidence. The VS Code vault encrypts records and artifacts.</small></span></label>
    <label className="setting-toggle"><input type="checkbox" disabled={!draft.consent} checked={draft.captureContent} onChange={event => setDraft({ ...draft, captureContent: event.target.checked })} />
      <span><strong>Include supplied content</strong><small>Keep imported prompts, outputs, and source excerpts. Otherwise, retain only the evidence metadata.</small></span></label>
    <label className="setting-toggle"><input type="checkbox" disabled={!draft.consent} checked={draft.liveCapture} onChange={event => setDraft({ ...draft, liveCapture: event.target.checked })} />
      <span><strong>Capture a task I choose</strong><small>VS Code only. Observe the selected task exit and bounded workspace fingerprint; not other terminals.</small></span></label>
    <label className="setting-toggle"><input type="checkbox" disabled={!draft.consent} checked={draft.externalAnalysis} onChange={event => setDraft({ ...draft, externalAnalysis: event.target.checked })} />
      <span><strong>Allow reviewed Azure analysis</strong><small>Off by default. Each request still requires a preview and approval; model drafts never change verdicts.</small></span></label>
    <label className="field"><span>Keep records for</span><select name="retentionDays" value={draft.retentionDays} onChange={event => setDraft({ ...draft, retentionDays: Number(event.target.value) })}>
      {[1, 7, 30, 90, 365].map(days => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}
    </select></label>
    <p className="muted-text">Expired records are shown for explicit removal. Nothing is silently deleted.</p>
    <div className="dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
      <button className="primary-button" type="button" onClick={() => onSave({ ...draft,
        captureContent: draft.consent && draft.captureContent, liveCapture: draft.consent && draft.liveCapture,
        externalAnalysis: draft.consent && draft.externalAnalysis })}>Save privacy choices</button></div>
  </Dialog>;
}
export function EvidenceWorkbench({ state, dispatch, host = 'browser' }: {
  state: WorkbenchState; dispatch: (action: WorkbenchAction) => void; host?: 'browser' | 'vscode';
}) {
  const [tab, setTab] = useState<Tab>('Review');
  const [scenario, setScenario] = useState<ExampleId>('stale');
  const [findingId, setFindingId] = useState('');
  const [eventId, setEventId] = useState('');
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [breakOnConcern, setBreakOnConcern] = useState(true);
  const [checkpointId, setCheckpointId] = useState('');
  const [fresh, setFresh] = useState(false);
  const tablist = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const recording = state.selected?.recording;
  const analysis = state.assessment;
  const finding = analysis?.findings.find(item => item.id === findingId) ?? analysis?.findings[0];
  const selectedEvent = recording?.events.find(event => event.id === eventId) ?? recording?.events[Math.max(0, cursor - 1)];
  const checkpoints = recording?.events.filter(event => event.checkpoint && event.seq < (finding?.seq ?? 0)) ?? [];
  useEffect(() => { setCursor(0); setEventId(''); setPlaying(false); setCheckpointId(''); setFindingId(''); }, [recording?.run.id]);
  useEffect(() => {
    if (!playing || !recording) return;
    const timer = window.setTimeout(() => {
      const next = recording.events[cursor];
      if (!next) { setPlaying(false); return; }
      setCursor(next.seq); setEventId(next.id);
      if (next.seq === recording.events.length || (breakOnConcern && analysis?.findings.some(item => item.eventId === next.id && item.verdict !== 'Supported'))) setPlaying(false);
    }, 900 / speed);
    return () => clearTimeout(timer);
  }, [playing, cursor, speed, breakOnConcern, recording, analysis]);
  const jump = (id: string) => {
    const event = recording?.events.find(item => item.id === id);
    setTab('Timeline'); setEventId(id); setCursor(event?.seq ?? 0); setPlaying(false);
  };
  const chooseFinding = (item: Finding) => { setFindingId(item.id); setCheckpointId(''); };
  const call = (action: WorkbenchAction) => { if (!state.busy) dispatch(action); };
  return <section className={`lens-workbench lens-host-${host}`} aria-label="Agent Evidence Lens" aria-busy={state.busy}>
    <header className="lens-hero">
      <div><p className="eyebrow">Agent Evidence Lens <span className="edition-label">FIELD NOTES / 01</span></p>
        <h2>The work is done.<br /><em>Does the proof still apply?</em></h2>
        <p className="page-summary">A clear view of what happened, what holds up, and what needs another look.</p></div>
      <div className="lens-privacy-mark"><LockKeyhole size={20} aria-hidden="true" /><span>{host === 'vscode' ? 'Encrypted on your device' : 'Private session preview'}<small>{host === 'vscode' ? 'Keys stay in VS Code SecretStorage' : 'Use the VS Code companion to save securely'}</small></span>
        {host === 'vscode' ? <AppearanceButton /> : null}</div>
    </header>
    {state.error ? <div className="inline-notice tone-danger" role="alert">{state.error}</div> : null}
    {state.notice ? <div className="inline-notice tone-info" role="status" aria-live="polite">{state.notice}</div> : null}
    {state.busy ? <div className="lens-progress" role="status" aria-live="polite"><span aria-hidden="true" />Working on your request…</div> : null}
    <div className="lens-launchpad">
      <label className="field"><span>Start with a real question</span><select name="evidenceExample" value={scenario}
        onChange={event => setScenario(event.target.value as ExampleId)}>
        {exampleScenarios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <div className="button-row">
        <button className="primary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'example', scenarioId: scenario })}>Try local example <ArrowRight size={16} aria-hidden="true" /></button>
        <button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'liveDemo', scenarioId: scenario })}><Radio size={15} aria-hidden="true" />Use live Azure</button>
        <button className="quiet-button" type="button" disabled={state.busy} onClick={() => call({ type: 'import' })}><FileInput size={15} aria-hidden="true" />Import a recording</button>
      </div>
      <p className="muted-text">{exampleScenarios.find(item => item.id === scenario)?.description} Examples are synthetic; “live Azure” adds a real model review, not live infrastructure tools.</p>
    </div>
    <div className="lens-browser">
      <aside className="lens-recordings" data-large={state.recordings.length > 50} aria-label="Evidence recordings">
        <div className="section-caption"><strong>Your evidence</strong><span>{state.recordings.length.toLocaleString()}</span></div>
        {!state.recordings.length ? <p className="muted-text">Your first recording starts here.</p> : state.recordings.map(item =>
          <button key={item.id} className={`lens-recording${recording?.run.id === item.id ? ' is-selected' : ''}`} type="button" disabled={state.busy}
            aria-current={recording?.run.id === item.id ? 'true' : undefined} onClick={() => call({ type: 'select', runId: item.id })}>
            <span className="recording-index" aria-hidden="true">{String(state.recordings.indexOf(item) + 1).padStart(2, '0')}</span>
            <span><strong>{item.name}</strong><small>{item.unresolved ? `${item.unresolved} to revisit` : item.claims ? 'Linked proof available' : 'No claims linked yet'}{item.synthetic ? ' / example' : ''}</small></span>
          </button>)}
        <div className="lens-source-actions">
          <button className="quiet-button" type="button" disabled={state.busy} onClick={() => call({ type: 'importCollector' })}>Bring in a collector run <ArrowUpRight size={14} aria-hidden="true" /></button>
          {host === 'vscode' ? <button className="quiet-button" type="button" disabled={state.busy} onClick={() => call({ type: 'captureValidation' })}>Capture a task I choose <ArrowUpRight size={14} aria-hidden="true" /></button> : null}
        </div>
      </aside>
      <div className="lens-desk">
        <div className="lens-tabs" role="tablist" aria-label="Evidence views" ref={tablist} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setTab(tabs[index]); tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
        }}>
          {tabs.map(name => <button key={name} type="button" role="tab" id={`${prefix}-${name}`} aria-controls={`${prefix}-panel`} aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}>{name}</button>)}
        </div>
        <section className="lens-tab-content" role="tabpanel" tabIndex={0} id={`${prefix}-panel`} aria-labelledby={`${prefix}-${tab}`}>
          {!recording && tab !== 'Privacy' ? <div className="lens-empty">
            <div className="empty-proof" aria-hidden="true"><span>OBSERVE</span><i /><span>QUESTION</span><i /><span>VERIFY</span></div>
            <h3>Less guessing. Better handoffs.</h3><p>Try an example or bring a recording. We link each claim to its actual result, code version, and target.</p>
            <p className="muted-text">No claim is marked true just because a tool returned successfully.</p>
          </div> : null}
          {recording && analysis && tab === 'Review' ? <>
            <div className="lens-run-heading"><div><p className="eyebrow">{recording.adapter.mode === 'live' ? 'Live source / bounded capture' : recording.run.synthetic ? 'Synthetic example / real local checks' : 'Imported evidence / read-only original'}</p><h3>{recording.run.name}</h3></div>
              <span className="coverage-label">{analysis.coverage === 'partial' ? 'Some activity is outside this capture' : 'Bounded capture'}</span></div>
            <div className="verdict-counts">{Object.entries(analysis.counts).map(([status, count]) => <div key={status}><strong>{count.toLocaleString()}</strong><span>{status}</span></div>)}</div>
            {!analysis.findings.length ? <div className="empty-state"><h4>This run has a timeline, but no linked claims.</h4><p>The source did not supply structured claims. Add versioned evidence annotations with the SDK; we will not guess from tool names.</p></div> : null}
            {analysis.findings.map(item => <article key={item.id} className={`finding-card finding-${item.verdict.toLowerCase()}`}>
              <div className="finding-caption"><span>CLAIM / {String(item.seq).padStart(2, '0')}</span><VerdictBadge verdict={item.verdict} /></div>
              <h4>{item.claim}</h4><p className="finding-takeaway">{verdictLabels[item.verdict].short}.</p><p>{plainReason(item)}</p>
              <div className="next-check"><span>Next step</span><p>{item.nextCheck}</p></div>
              <div className="button-row">
                {item.evidenceIds.map(id => <button className="quiet-button" type="button" key={id} onClick={() => jump(id)}>See the result <ArrowUpRight size={14} aria-hidden="true" /></button>)}
                <button className="quiet-button" type="button" disabled={state.busy} onClick={() => call({ type: 'draftCorrection', findingId: item.id })}>Draft a clearer claim</button>
                {item.verdict !== 'Supported' ? <button className="quiet-button" type="button" onClick={() => { chooseFinding(item); setTab('Recovery'); }}>Review a recovery path</button> : null}
              </div>
              <details><summary>Version, scope &amp; review history</summary><p>{item.explanation}</p><JsonBlock title="Claim target" value={item.expectedScope} />
                <JsonBlock title="Observed target" value={item.observedScopes} />
                <div className="button-row"><button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'reviewFinding', findingId: item.id, decision: 'acknowledged' })}>Acknowledge finding</button>
                  <button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'reviewFinding', findingId: item.id, decision: 'dismissed' })}>Mark reviewed, not applicable</button></div><p className="muted-text">Review notes do not rewrite evidence or change the computed verdict.</p>
              </details>
            </article>)}
            <details><summary>What these checks establish</summary><p>{analysis.limitation}</p></details>
          </> : null}
          {recording && tab === 'Timeline' ? <>
            <div className="section-caption"><div><h3>Follow the steps</h3><p className="muted-text">Read-only playback. No tools run and no approvals change.</p></div><span>{cursor} / {recording.events.length}</span></div>
            <div className="button-row">
              <button className="secondary-button" type="button" aria-label="Previous evidence step" disabled={!cursor} onClick={() => { setPlaying(false); setCursor(cursor - 1); setEventId(recording.events[cursor - 2]?.id ?? ''); }}><ChevronLeft size={16} aria-hidden="true" />Back</button>
              <button className="primary-button" type="button" onClick={() => { if (cursor === recording.events.length) setCursor(0); setPlaying(!playing); }}>{playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? 'Pause' : 'Play timeline'}</button>
              <button className="secondary-button" type="button" aria-label="Next evidence step" disabled={cursor === recording.events.length} onClick={() => { setPlaying(false); setCursor(cursor + 1); setEventId(recording.events[cursor].id); }}>Next<ChevronRight size={16} aria-hidden="true" /></button>
              <button className="quiet-button" type="button" onClick={() => { setPlaying(false); setCursor(0); setEventId(''); }}><RotateCcw size={14} aria-hidden="true" />Reset</button>
            </div>
            <div className="filter-row"><label className="field field-inline"><span>Timeline position</span><input type="range" min="0" max={recording.events.length} value={cursor} onChange={event => { const n = Number(event.target.value); setCursor(n); setEventId(recording.events[n - 1]?.id ?? ''); setPlaying(false); }} /></label>
              <label className="field"><span>Speed</span><select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}x</option>)}</select></label>
              <label className="checkbox-field"><input type="checkbox" checked={breakOnConcern} onChange={event => setBreakOnConcern(event.target.checked)} />Pause at concerns</label></div>
            <div className="lens-timeline-layout"><ol className="evidence-timeline" data-large={recording.events.length > 50}>{recording.events.map(event => <li key={event.id}>
              <button className={selectedEvent?.id === event.id && cursor ? 'is-selected' : ''} type="button" aria-current={selectedEvent?.id === event.id && cursor ? 'step' : undefined} onClick={() => jump(event.id)}>
                <span className="step-number">{String(event.seq).padStart(2, '0')}</span><span><strong>{event.name}</strong><small>{event.type.replaceAll('.', ' / ')}</small></span>
              </button></li>)}</ol>
              <aside className="evidence-inspector" aria-label="Selected evidence step"><h4>{cursor && selectedEvent ? selectedEvent.name : 'The run has not started at this position'}</h4>
                {cursor && selectedEvent ? <><p className="muted-text">{new Date(selectedEvent.timestamp).toLocaleString()}</p><JsonBlock title="Scope at this step" value={selectedEvent.scope} />
                  {selectedEvent.observation ? <JsonBlock title="Actual result" value={selectedEvent.observation} /> : null}
                  {selectedEvent.model ? <JsonBlock title="Measured model activity" value={selectedEvent.model} /> : null}
                  {selectedEvent.claim ? <JsonBlock title="Linked claim" value={selectedEvent.claim} /> : null}
                  {selectedEvent.checkpoint ? <><p>{selectedEvent.checkpoint.boundary}</p><JsonBlock title="Compatible mock state" value={selectedEvent.checkpoint} /></> : null}
                  {selectedEvent.content ? <JsonBlock title="Captured content" value={selectedEvent.content} /> : <p className="muted-text">Raw content is not included at this step.</p>}
                  <p className="muted-text">Parents: {selectedEvent.parents.join(', ') || 'none captured'}</p></> : null}
              </aside></div>
          </> : null}
          {recording && analysis && tab === 'Manifest' ? <>
            <h3>What was in this run?</h3><p className="muted-text">Available does not mean used. Unknown versions stay unknown.</p>
            <div className="table-scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">Available</th><th scope="col">Actually used</th><th scope="col">Version</th></tr></thead><tbody>
              {analysis.manifest.map(item => <tr key={`${item.kind}:${item.id}`}><td><strong>{item.name}</strong><small>{item.kind}</small></td><td>{item.available ? 'Yes' : 'Not established'}</td>
                <td>{item.usedBy.length ? <button type="button" className="text-button" onClick={() => jump(item.usedBy[0])}>{item.usedBy.length} linked steps</button> : 'Not observed'}</td><td><span className="version-value" title={item.version ?? ''}>{item.version ?? 'Unavailable'}</span></td></tr>)}
            </tbody></table></div>
            <h4>Capture gaps</h4>{analysis.gaps.map((gap, index) => <p className="gap-note" key={`${gap.code}:${index}`}>{gap.detail}{gap.eventId ? <button type="button" className="text-button" onClick={() => jump(gap.eventId!)}>See linked step</button> : null}</p>)}
          </> : null}
          {recording && analysis && tab === 'Handoff' ? <>
            <h3>Leave the next developer a clear picture.</h3><p className="muted-text">Keep the supported conclusions, open questions, and required checks together.</p>
            <div className="button-row"><button className="primary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'export', format: 'markdown' })}>Review handoff export</button>
              <button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'modelReview' })}>Draft with Azure</button>
              <button className="quiet-button" type="button" disabled={state.busy} onClick={() => call({ type: 'export', format: 'json' })}>Review recording export</button></div>
            <div className="handoff-section"><h4>What holds up</h4>{analysis.findings.filter(item => item.verdict === 'Supported').map(item => <p key={item.id}>{item.claim} <button className="text-button" type="button" onClick={() => jump(item.evidenceIds[0])}>See proof</button></p>)}
              {!analysis.counts.Supported ? <p>No supported conclusion is established yet.</p> : null}</div>
            <div className="handoff-section"><h4>What still needs a check</h4>{analysis.requiredChecks.length ? analysis.requiredChecks.map(check => <p key={check}>{check}</p>) : <p>No additional check is required for the narrow captured claims.</p>}</div>
            <details><summary>Full evidence-linked handoff</summary><pre className="readable-pre">{analysis.summary}</pre></details>
            {host === 'vscode' ? <button className="secondary-button" type="button" disabled={state.busy || !analysis.requiredChecks.length} onClick={() => call({ type: 'instructionProposal' })}>Propose a reviewed workspace rule</button> : <p className="muted-text">Reviewed workspace-rule proposals are available in the VS Code companion. No rules are learned or changed automatically.</p>}
            {state.selected?.artifacts.map(artifact => <article key={artifact.id} className="artifact-card"><p className="eyebrow">{artifact.kind.replaceAll('-', ' ')} / saved separately</p><h4>{artifact.title}</h4><pre className="readable-pre">{artifact.text}</pre></article>)}
          </> : null}
          {recording && tab === 'Compare' ? <>
            <h3>Did the new evidence change anything?</h3><label className="field"><span>Compare this run with</span><select defaultValue="" key={recording.run.id} onChange={event => { if (event.target.value) call({ type: 'compare', runId: event.target.value }); }}>
              <option value="">Choose another recording</option>{state.recordings.filter(item => item.id !== recording.run.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            {state.comparison ? <><p className="inline-note">{state.comparison.linked ? 'A new run is linked to the original. The old evidence has not changed.' : 'These are separate runs. Differences alone do not establish a causal improvement.'}</p>
              <div className="table-scroll"><table><thead><tr><th>Claim</th><th>Before</th><th>After</th></tr></thead><tbody>{state.comparison.changes.map((change, index) => <tr key={index}><td>{change.claim}</td><td><VerdictBadge verdict={change.before} /></td><td><VerdictBadge verdict={change.after} /></td></tr>)}</tbody></table></div>
              {state.comparison.scopeChanges.length ? <JsonBlock title="Scope changes" value={state.comparison.scopeChanges} /> : <p className="muted-text">The compared final scopes match. A removed claim is not counted as a fix.</p>}</>
              : <p className="muted-text">Create a recovery run or choose another recording to see the difference.</p>}
          </> : null}
          {recording && analysis && tab === 'Recovery' ? <>
            <h3>A deliberate restart. Not a blind retry.</h3><p className="muted-text">Review the concern, the real restart point, and every effect before creating a new run.</p>
            <label className="field"><span>Concern to address</span><select value={finding?.id ?? ''} onChange={event => { setFindingId(event.target.value); setCheckpointId(''); }}>
              {!analysis.findings.length ? <option value="">No structured finding in this recording</option> : analysis.findings.map(item => <option value={item.id} key={item.id}>{item.claim}</option>)}</select></label>
            {finding ? <><div className="next-check"><span>Noticed at step {finding.seq}</span><p>{finding.explanation}</p></div>
              <label className="field"><span>Earlier checkpoint</span><select value={checkpointId || checkpoints[0]?.id || ''} disabled={fresh} onChange={event => setCheckpointId(event.target.value)}>
                {!checkpoints.length ? <option value="">No earlier checkpoint is captured</option> : checkpoints.map(event => <option key={event.id} value={event.id}>Step {event.seq}: {event.name}</option>)}</select></label>
              <label className="checkbox-field"><input type="checkbox" checked={fresh} onChange={event => setFresh(event.target.checked)} />Start a fresh mock run instead of restoring a checkpoint</label>
              <button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'planRecovery', findingId: finding.id, checkpointId: checkpointId || checkpoints[0]?.id || null, fresh })}>Review recovery plan</button></> : null}
            {state.plan ? <article className="recovery-plan"><p className="eyebrow">{state.plan.mode === 'handoff' ? 'Handoff only / no execution' : state.plan.mode === 'mock-fresh' ? 'New mock run / not exact resume' : 'Compatible mock checkpoint / new linked run'}</p>
              <h4>Actual restart boundary</h4><p>{state.plan.restartBoundary}</p><p>{state.plan.reason}</p><h4>Proposed correction</h4><p>{state.plan.correction}</p>
              <h4>Effects you are approving</h4><ul>{state.plan.effects.map(effect => <li key={effect}>{effect}</li>)}</ul>
              <p className="muted-text">Limit: {state.plan.limits.maxEvents} events, {state.plan.limits.timeoutMs / 1000} seconds, {state.plan.limits.externalWrites} external writes.</p>
              {state.plan.executable ? <button className="primary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'executeRecovery', planId: state.plan!.id })}>Approve this plan &amp; create new run</button>
                : <button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'export', format: 'markdown' })}>Review a fresh-run handoff</button>}
            </article> : null}
          </> : null}
          {tab === 'Privacy' ? <>
            <div className="section-caption"><div><h3>Your evidence. Your boundaries.</h3><p className="muted-text">Capture only what you have chosen. Review anything that leaves.</p></div>
              <button className="primary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'privacy' })}>Change privacy choices</button></div>
            <dl className="privacy-summary"><div><dt>Local recording</dt><dd>{state.settings.consent ? 'Allowed' : 'Not enabled'}</dd></div>
              <div><dt>Supplied content</dt><dd>{state.settings.captureContent ? 'Included with imports' : 'Minimized'}</dd></div><div><dt>Task capture</dt><dd>{state.settings.liveCapture ? 'Selected tasks only' : 'Off'}</dd></div>
              <div><dt>External analysis</dt><dd>{state.settings.externalAnalysis ? 'Preview and approval required' : 'Off'}</dd></div><div><dt>Retention</dt><dd>{state.settings.retentionDays} days, reviewed removal</dd></div></dl>
            <p className="gap-note">{host === 'vscode' ? 'Recordings and review artifacts are encrypted with AES-256-GCM. The key is kept in VS Code SecretStorage. Plaintext exports are not encrypted.' : 'This browser view is memory-only, not an encrypted vault. Refreshing clears it. The original recorder uses plaintext SQLite; use the VS Code companion for encrypted records.'}</p>
            <h4>Source health &amp; honest limits</h4><div className="source-health">{state.health.map(source => <article key={source.id}><div><strong>{source.id}</strong><span className="source-status">{source.status}</span></div><p>{source.detail}</p><small>Adapter version: {source.version ?? 'not available'}</small></article>)}</div>
            {host === 'vscode' ? <div className="button-row"><button className="secondary-button" type="button" disabled={state.busy} onClick={() => call({ type: 'purge' })}>Review expired records</button>
              <button className="quiet-button" type="button" onClick={() => call({ type: 'existingChat' })}>Open regular Chat</button></div> : null}
          </> : null}
        </section>
      </div>
    </div>
    <footer className="lens-footnote"><span>Recorded facts, not hidden reasoning.</span><span>Originals stay unchanged. Every recovery is a new run.</span></footer>
  </section>;
}
