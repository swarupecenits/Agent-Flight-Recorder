import { useEffect, useRef, useState } from 'react';
import type { Assessment, LensComparison, LensRecording, RecoveryPlan, SourceHealth, StoredRecording, WorkbenchAction, WorkbenchState } from '../../lens/types';
import { defaultSettings } from '../../lens/catalog';
import { api, getErrorMessage, request } from '../lib/api';
import { EvidenceWorkbench, PrivacyDialog } from './EvidenceWorkbench';
import { Dialog } from './Dialog';
import type { Run } from '../../shared/contracts';

interface AnalysisResult { recording: LensRecording; assessment: Assessment; draft?: { text: string }; comparison?: LensComparison }
interface Review { title: string; detail: string; content?: string; approve: string }
const initial: WorkbenchState = { settings: defaultSettings, recordings: [], selected: null, assessment: null,
  comparison: null, plan: null, health: [], error: null, notice: null, busy: false };
export function EvidencePage({ collectorRunId }: { collectorRunId?: string }) {
  const [state, setState] = useState<WorkbenchState>(initial);
  const current = useRef(state);
  const records = useRef(new Map<string, { stored: StoredRecording; assessment: Assessment }>());
  const file = useRef<HTMLInputElement>(null);
  const [privacy, setPrivacy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const resolution = useRef<((approved: boolean) => void) | null>(null);
  const [collectorRuns, setCollectorRuns] = useState<Run[] | null>(null);
  const [collectorId, setCollectorId] = useState('');
  const update = (patch: Partial<WorkbenchState>) => { current.current = { ...current.current, ...patch }; setState(current.current); };
  const confirm = (value: Review) => new Promise<boolean>(resolve => { resolution.current = resolve; setReview(value); });
  const resolveReview = (approved: boolean) => { resolution.current?.(approved); resolution.current = null; setReview(null); };
  const adopt = (value: AnalysisResult) => {
    const previous = records.current.get(value.recording.run.id);
    if (previous && previous.stored.recording.integrity.digest !== value.recording.integrity.digest) throw new Error('A different immutable recording already has this ID. It was not overwritten.');
    const stored: StoredRecording = previous?.stored ?? { recording: value.recording, artifacts: [], savedAt: new Date().toISOString() };
    if (value.draft && !previous) stored.artifacts.push({ id: crypto.randomUUID(), kind: 'model-draft', title: 'Live Azure draft / requires review', text: value.draft.text, createdAt: new Date().toISOString() });
    records.current.set(value.recording.run.id, { stored, assessment: value.assessment });
    update({ selected: stored, assessment: value.assessment, comparison: value.comparison ?? null, plan: null,
      recordings: [...records.current.values()].reverse().map(({ stored: item, assessment }) => ({
        id: item.recording.run.id, name: item.recording.run.name, status: item.recording.run.status, startedAt: item.recording.run.startedAt,
        synthetic: item.recording.run.synthetic, claims: assessment.findings.length, unresolved: assessment.findings.length - assessment.counts.Supported,
      })) });
  };
  const artifact = (kind: StoredRecording['artifacts'][number]['kind'], title: string, text: string) => {
    const selected = current.current.selected;
    if (!selected) throw new Error('Choose a recording first.');
    const entry = { id: crypto.randomUUID(), kind, title, text, createdAt: new Date().toISOString() };
    const next = { ...selected, artifacts: [...selected.artifacts, entry] };
    records.current.set(next.recording.run.id, { stored: next, assessment: current.current.assessment! });
    update({ selected: next, notice: 'Saved as a separate session note. The original evidence is unchanged. Find it in Handoff.' });
  };
  const ensureConsent = async () => {
    if (current.current.settings.consent) return true;
    const approved = await confirm({ title: 'Start a local evidence workspace?', detail: 'This browser keeps evidence in memory only. No private Chat panels are read, and no data is sent to Azure unless you separately approve it. Refreshing clears this preview. The VS Code companion saves encrypted records.', approve: 'Allow local evidence' });
    if (approved) update({ settings: { ...current.current.settings, consent: true } });
    return approved;
  };
  const perform = async (work: () => Promise<void>) => {
    if (current.current.busy) return;
    update({ busy: true, error: null, notice: null });
    try { await work(); } catch (error) { update({ error: getErrorMessage(error) }); }
    finally { update({ busy: false }); }
  };
  const readCollector = async (id: string) => {
    if (!(await ensureConsent())) return;
    adopt(await request<AnalysisResult>(`/runs/${encodeURIComponent(id)}/evidence`));
    update({ notice: 'Imported into this session. The collector original remains unchanged in its separate plaintext SQLite store.' });
  };
  useEffect(() => {
    const controller = new AbortController();
    request<{ adapters: SourceHealth[]; provider: { ready: boolean; reason: string; deployment: string } }>('/lens/status', { signal: controller.signal })
      .then(value => update({ health: [...value.adapters, { id: 'azure-responses', version: 'v1', status: value.provider.ready ? 'capturing' : 'disabled',
        detail: value.provider.ready ? `${value.provider.deployment} is configured. Calls occur only after you approve a request; no background model calls.` : value.provider.reason,
        capabilities: ['optional-model-draft'] }] }))
      .catch(error => { if (!controller.signal.aborted) update({ error: getErrorMessage(error) }); });
    return () => { controller.abort(); resolution.current?.(false); };
  }, []);
  const loadedCollector = useRef<string | null>(null);
  useEffect(() => {
    if (collectorRunId && loadedCollector.current !== collectorRunId) {
      loadedCollector.current = collectorRunId;
      void perform(() => readCollector(collectorRunId));
    }
  }, [collectorRunId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (records.current.size) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const dispatch = (action: WorkbenchAction) => {
    if (action.type === 'privacy') { setPrivacy(true); return; }
    if (action.type === 'updatePrivacy') { update({ settings: action.settings }); setPrivacy(false); return; }
    if (action.type === 'import') { file.current?.click(); return; }
    void perform(async () => {
      const selected = current.current.selected;
      const analysis = current.current.assessment;
      switch (action.type) {
        case 'example':
          if (await ensureConsent()) adopt(await request<AnalysisResult>('/lens/example', { method: 'POST', json: { scenarioId: action.scenarioId } }));
          break;
        case 'liveDemo': {
          if (!(await ensureConsent())) break;
          const prepared = await request<{ prepareId: string; context: string; endpoint: string }>('/lens/live-demo/prepare', { method: 'POST', json: { scenarioId: action.scenarioId } });
          if (!(await confirm({ title: 'Review the live Azure request', detail: `Send exactly this synthetic evidence to ${prepared.endpoint || 'the configured Azure endpoint'}? This uses your model deployment and may incur usage charges. No project source files are sent. The model drafts a handoff; it does not run tools or change verdicts.`,
            content: prepared.context, approve: 'Approve & run live Azure' }))) break;
          update({ settings: { ...current.current.settings, externalAnalysis: true } });
          adopt(await request<AnalysisResult>('/lens/live-demo', { method: 'POST', json: { scenarioId: action.scenarioId, prepareId: prepared.prepareId, requestId: crypto.randomUUID(), consent: true } }));
          update({ notice: 'A real Azure stream completed. Open Handoff for its advisory draft. Local checks and recovery remain synthetic and bounded.' });
          break;
        }
        case 'select': {
          const value = records.current.get(action.runId);
          if (!value) throw new Error('This recording is not in the current browser session.');
          update({ selected: value.stored, assessment: value.assessment, plan: null, comparison: null });
          break;
        }
        case 'importCollector': {
          const { runs } = await api.getRuns({});
          setCollectorRuns(runs); setCollectorId(runs[0]?.id ?? '');
          break;
        }
        case 'compare': {
          const other = records.current.get(action.runId);
          if (!selected || !other) throw new Error('Choose two available recordings to compare.');
          const original = selected.recording.run.parentRunId === other.stored.recording.run.id ? other.stored.recording : selected.recording;
          const corrected = original === selected.recording ? other.stored.recording : selected.recording;
          update({ comparison: await request<LensComparison>('/lens/compare', { method: 'POST', json: { original, corrected } }) });
          break;
        }
        case 'draftCorrection': {
          const finding = analysis?.findings.find(item => item.id === action.findingId);
          if (!finding) throw new Error('Choose an available finding first.');
          if (await confirm({ title: 'Review a clearer claim', detail: 'Save this as a draft note, without changing the original claim or verdict?', content: finding.correction, approve: 'Save reviewed draft' })) artifact('correction', 'Reviewed claim correction', finding.correction);
          break;
        }
        case 'reviewFinding':
          if (!analysis?.findings.some(item => item.id === action.findingId)) throw new Error('The selected finding is not available.');
          artifact('review', `Finding ${action.decision}`, `${action.findingId}: ${action.decision}. This is a human review note, not a changed deterministic verdict.`);
          break;
        case 'planRecovery':
          if (!selected) throw new Error('Choose a recording first.');
          update({ plan: await request<RecoveryPlan>('/lens/recovery/plan', { method: 'POST', json: { recording: selected.recording,
            findingId: action.findingId, checkpointId: action.checkpointId, fresh: action.fresh } }) });
          break;
        case 'executeRecovery':
          if (current.current.plan?.id !== action.planId) throw new Error('Review this exact plan before execution.');
          adopt(await request<AnalysisResult>('/lens/recovery/execute', { method: 'POST', json: { planId: action.planId, approved: true } }));
          update({ notice: 'Created a new linked mock run. The original was not changed. Open Compare to inspect the new proof.' });
          break;
        case 'modelReview': {
          if (!selected || !(await ensureConsent())) break;
          const preview = await request<{ context: string; endpoint: string }>('/lens/model-context', { method: 'POST', json: { recording: selected.recording } });
          if (!(await confirm({ title: 'Review what leaves this device', detail: `Send the exact metadata below to ${preview.endpoint}? It may include repository or resource identities and uses your model quota. The original content is omitted. The result is advisory only.`,
            content: preview.context, approve: 'Approve Azure draft' }))) break;
          update({ settings: { ...current.current.settings, externalAnalysis: true } });
          const draft = await request<{ text: string }>('/lens/model-review', { method: 'POST', json: { recording: selected.recording, consent: true, requestId: crypto.randomUUID() } });
          artifact('model-draft', 'Azure-assisted handoff / review before sharing', draft.text);
          break;
        }
        case 'export': {
          if (!selected || !analysis) throw new Error('Choose a recording first.');
          const text = action.format === 'json' ? JSON.stringify(selected.recording, null, 2) : analysis.summary;
          if (!(await confirm({ title: 'Review this plaintext export', detail: 'This exact file will be saved unencrypted. Inspect it before sharing. Separate model drafts and review notes are not included in the immutable recording export.',
            content: text, approve: 'Download reviewed file' }))) break;
          const url = URL.createObjectURL(new Blob([text], { type: action.format === 'json' ? 'application/json' : 'text/markdown' }));
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = `evidence-${selected.recording.run.id}.${action.format === 'json' ? 'json' : 'md'}`; anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          break;
        }
        default:
          throw new Error('This capability belongs to the VS Code companion; no browser-side substitute was executed.');
      }
    });
  };
  return <>
    <input className="visually-hidden" tabIndex={-1} ref={file} aria-label="Import evidence recording" type="file" accept=".json,application/json" onChange={event => {
      const selected = event.target.files?.[0]; event.target.value = '';
      if (!selected) return;
      void perform(async () => {
        if (!(await ensureConsent())) return;
        if (selected.size > 6 * 1024 * 1024) throw new Error('Choose an evidence file no larger than 6 MiB.');
        let recording: unknown;
        try { recording = JSON.parse(await selected.text()); } catch { throw new Error('The selected file is not valid JSON. Choose a native recorder or Evidence Lens export.'); }
        adopt(await request<AnalysisResult>('/lens/analyze', { method: 'POST', json: { recording, captureContent: current.current.settings.captureContent } }));
      });
    }} />
    <EvidenceWorkbench state={state} dispatch={dispatch} />
    <PrivacyDialog open={privacy} settings={state.settings} onClose={() => setPrivacy(false)} onSave={settings => dispatch({ type: 'updatePrivacy', settings })} />
    <Dialog title={review?.title ?? 'Review'} open={Boolean(review)} onClose={() => resolveReview(false)} wide={Boolean(review?.content)}>
      <p>{review?.detail}</p>{review?.content ? <pre className="review-preview" tabIndex={0}>{review.content}</pre> : null}
      <div className="dialog-footer"><button className="secondary-button" type="button" onClick={() => resolveReview(false)}>Cancel</button>
        <button className="primary-button" type="button" onClick={() => resolveReview(true)}>{review?.approve}</button></div>
    </Dialog>
    <Dialog title="Bring in a collector run" open={collectorRuns !== null} onClose={() => setCollectorRuns(null)}>
      {collectorRuns?.length ? <label className="field"><span>Recording</span><select value={collectorId} onChange={event => setCollectorId(event.target.value)}>
        {collectorRuns.map(run => <option key={run.id} value={run.id}>{run.name}</option>)}</select></label> : <p>No collector recordings yet. Start a run from Recordings or instrument your own agent.</p>}
      <div className="dialog-footer"><button className="secondary-button" type="button" onClick={() => setCollectorRuns(null)}>Cancel</button>
        <button className="primary-button" type="button" disabled={!collectorId} onClick={() => { setCollectorRuns(null); void perform(() => readCollector(collectorId)); }}>Import selected run</button></div>
    </Dialog>
  </>;
}
