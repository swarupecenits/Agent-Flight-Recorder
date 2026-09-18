import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileJson,
  FileText,
  Filter,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Mail,
  Pause,
  Play,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Upload,
  Waypoints,
  XCircle,
} from 'lucide-react';
import type {
  Comparison,
  Insight,
  Overview,
  Policy,
  ReplayResult,
  Run,
  RunDetail,
  RunStatus,
  Scenario,
  TraceEvent,
} from '../shared/contracts.ts';
import { JsonBlock } from './components/JsonBlock';
import { StatusChip } from './components/StatusChip';
import { api, getErrorMessage } from './lib/api';
import {
  clamp,
  formatCompactNumber,
  formatDateTime,
  formatDuration,
  formatEventType,
  formatTime,
  originLabel,
  sentenceCase,
} from './lib/format';
import { pageHash, parseHash, recordingsHash, runHash, type AppRoute } from './lib/router';

type NoticeTone = 'info' | 'success' | 'danger';
type ReplaySpeed = 0.5 | 1 | 2 | 4;
type FocusFilter = 'all' | 'errors' | 'policies' | 'approvals' | 'tools' | 'models';
const importLimitBytes = 5 * 1024 * 1024;

interface FlashMessage {
  tone: NoticeTone;
  message: string;
}

function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash || '#/'));

  useEffect(() => {
    const handleChange = () => setRoute(parseHash(window.location.hash || '#/'));
    window.addEventListener('hashchange', handleChange);
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  return route;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}

function isActiveStatus(status: RunStatus): boolean {
  return status === 'running' || status === 'awaiting_approval';
}

function isLiveUpdatableRun(run: Run): boolean {
  return !run.readOnly && isActiveStatus(run.status);
}

function statusTone(status: RunStatus): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'awaiting_approval':
      return 'warning';
    case 'blocked':
      return 'warning';
    case 'failed':
    case 'interrupted':
      return 'danger';
    case 'running':
      return 'info';
    default:
      return 'neutral';
  }
}

function severityTone(severity: Insight['severity']): 'info' | 'warning' | 'danger' {
  switch (severity) {
    case 'error':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

function policyTone(outcome: Policy['outcome']): 'success' | 'warning' | 'danger' {
  switch (outcome) {
    case 'allow':
      return 'success';
    case 'require_approval':
      return 'warning';
    default:
      return 'danger';
  }
}

function focusMatches(focus: FocusFilter, event: TraceEvent): boolean {
  if (focus === 'all') return true;
  if (focus === 'errors') return Boolean(event.error) || event.type.endsWith('.failed') || event.type === 'run.failed';
  if (focus === 'policies') return event.type === 'policy.evaluated';
  if (focus === 'approvals') return event.type.startsWith('approval.');
  if (focus === 'tools') return event.type.startsWith('tool.');
  return event.type.startsWith('model.');
}

function isBreakpointEvent(event: TraceEvent): boolean {
  return (
    event.type === 'tool.failed' ||
    event.type === 'model.failed' ||
    event.type === 'policy.evaluated' ||
    event.type === 'approval.requested' ||
    event.type === 'approval.resolved'
  );
}

function truncate(value: string, max = 88): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function App() {
  const route = useHashRoute();
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  useEffect(() => {
    if (!flash) return undefined;
    const timeoutId = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [flash]);

  const showFlash = (message: string, tone: NoticeTone = 'info') => {
    setFlash({ message, tone });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Waypoints size={24} />
          </div>
          <div>
            <p className="eyebrow">Local observability workbench</p>
            <h1>Agent Flight Recorder</h1>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          <SidebarLink href={recordingsHash()} active={route.page === 'recordings'} icon={<Activity size={18} />}>
            Recordings
          </SidebarLink>
          <SidebarLink href={pageHash('insights')} active={route.page === 'insights'} icon={<Gauge size={18} />}>
            Insights
          </SidebarLink>
          <SidebarLink href={pageHash('policies')} active={route.page === 'policies'} icon={<Shield size={18} />}>
            Policies
          </SidebarLink>
          <SidebarLink href={pageHash('connect')} active={route.page === 'connect'} icon={<Plug size={18} />}>
            Connect
          </SidebarLink>
        </nav>
        <div className="sidebar-panel">
          <p className="sidebar-panel-title">Scope</p>
          <p>
            Local capture of prompts, decisions, model and tool calls, retries, policy gates, approvals, failures,
            replay, and exports.
          </p>
          <p className="muted-text">
            Scripted demos are deterministic and fictional. Replay is always read-only.
          </p>
        </div>
      </aside>

      <main className="content-shell" id="main-content" tabIndex={-1}>
        {flash ? <InlineNotice tone={flash.tone} message={flash.message} dismiss={() => setFlash(null)} /> : null}
        {route.page === 'recordings' ? <OverviewPage showFlash={showFlash} /> : null}
        {route.page === 'insights' ? <InsightsPage /> : null}
        {route.page === 'policies' ? <PoliciesPage /> : null}
        {route.page === 'connect' ? <ConnectPage showFlash={showFlash} /> : null}
        {route.page === 'invalid' ? <ErrorState message={route.message} /> : null}
        {route.page === 'run' ? (
          <RunDetailPage key={route.runId} runId={route.runId} initialEventSeq={route.eventSeq} showFlash={showFlash} />
        ) : null}
      </main>
    </div>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: string;
}) {
  return (
    <a className={`sidebar-link${active ? ' is-active' : ''}`} href={href} aria-current={active ? 'page' : undefined}>
      {icon}
      <span>{children}</span>
      <ChevronRight size={16} />
    </a>
  );
}

function InlineNotice({
  tone,
  message,
  dismiss,
}: {
  tone: NoticeTone;
  message: string;
  dismiss?: () => void;
}) {
  return (
    <div className={`inline-notice tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'} aria-live={tone === 'danger' ? 'assertive' : 'polite'}>
      <span>{message}</span>
      {dismiss ? (
        <button className="ghost-button" type="button" onClick={dismiss} aria-label="Dismiss message">
          <XCircle size={16} />
        </button>
      ) : null}
    </div>
  );
}

function LoadingState({ label = 'Loading recorder data…' }: { label?: string }) {
  return (
    <div className="placeholder-card" role="status" aria-live="polite">
      <RefreshCw size={18} className="spinning-icon" />
      <p>{label}</p>
    </div>
  );
}

function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="placeholder-card error-card" role="alert">
      <AlertTriangle size={18} />
      <p>{message}</p>
      {retry ? (
        <button className="secondary-button" type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-header">
        <span className="stat-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}

function OverviewPage({ showFlash }: { showFlash: (message: string, tone?: NoticeTone) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RunStatus | ''>('');
  const [selectedScenarioId, setSelectedScenarioId] = useState<Scenario['id']>('approval');
  const [recordingDemo, setRecordingDemo] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, scenariosResponse] = await Promise.all([api.getOverview(), api.getScenarios()]);
      setOverview(overviewResponse);
      setScenarios(scenariosResponse.scenarios);
      setSelectedScenarioId((current) => scenariosResponse.scenarios.some((item) => item.id === current) ? current : scenariosResponse.scenarios[0]?.id ?? 'approval');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRunsLoading(true);
    setRunsError(null);
    api
      .getRuns({ q: debouncedSearch.trim(), status }, controller.signal)
      .then((response) => setRuns(response.runs))
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setRunsError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunsLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, status]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const intervalId = window.setInterval(() => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      Promise.all([api.getOverview(controller.signal), api.getRuns({ q: debouncedSearch.trim(), status }, controller.signal)])
        .then(([nextOverview, nextRuns]) => {
          if (controller.signal.aborted) return;
          setOverview(nextOverview);
          setRuns(nextRuns.runs);
          setRefreshError(null);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setRefreshError(getErrorMessage(error));
        })
        .finally(() => { inFlight = false; });
    }, 3000);
    return () => { controller.abort(); window.clearInterval(intervalId); };
  }, [debouncedSearch, status]);

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;

  const handleRecordDemo = async () => {
    setRecordingDemo(true);
    try {
      const response = await api.createDemo(selectedScenarioId);
      showFlash('Started a real local demo recording with deterministic agent logic.', 'success');
      window.location.hash = runHash(response.runId);
    } catch (mutationError) {
      showFlash(getErrorMessage(mutationError), 'danger');
    } finally {
      setRecordingDemo(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      showFlash('Choose a JSON recording file to import.', 'danger');
      return;
    }
    if (importFile.size > importLimitBytes) {
      showFlash('Import files must be 5 MiB or smaller.', 'danger');
      return;
    }

    setImporting(true);
    try {
      const text = await importFile.text();
      let recording: unknown;
      try {
        recording = JSON.parse(text);
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : 'Unknown JSON parse error.';
        showFlash(`Malformed JSON import: ${message}`, 'danger');
        return;
      }

      const response = await api.importRecording(recording);
      showFlash(
        response.duplicate ? 'Opened the existing identical recording.' : 'Imported recording successfully.',
        'success',
      );
      window.location.hash = runHash(response.runId);
    } catch (importError) {
      showFlash(getErrorMessage(importError), 'danger');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !overview) {
    return <ErrorState message={error ?? 'Failed to load overview.'} retry={() => void loadOverview()} />;
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Recorded executions</p>
          <h2>Trace every observable step of your local agents</h2>
          <p className="page-summary">
            Capture actual backend events for prompts, explicit decisions, tool work, retries, policy gates, local
            approvals, and outbox deliveries.
          </p>
        </div>
        <div className="badge-row">
          <StatusChip tone="accent">Fictional demo data</StatusChip>
          <StatusChip tone="info">Deterministic local agent logic</StatusChip>
        </div>
      </header>

      <section className="stats-grid" aria-label="Recorder totals">
        <StatCard icon={<Activity size={18} />} label="Runs" value={formatCompactNumber(overview.stats.runs)} />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={formatCompactNumber(overview.stats.completed)} />
        <StatCard icon={<AlertTriangle size={18} />} label="Failures" value={formatCompactNumber(overview.stats.failed)} />
        <StatCard icon={<ShieldAlert size={18} />} label="Awaiting approval" value={formatCompactNumber(overview.stats.awaitingApproval)} />
        <StatCard icon={<Bot size={18} />} label="Events" value={formatCompactNumber(overview.stats.events)} />
        <StatCard icon={<Clock3 size={18} />} label="Avg duration" value={formatDuration(overview.stats.averageDurationMs)} />
      </section>
      {refreshError ? <InlineNotice tone="danger" message={`Dashboard updates failed: ${refreshError}. Retrying automatically.`} /> : null}

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Start a sandbox run</p>
              <h3>Record demo</h3>
            </div>
            <FlaskConical size={18} />
          </div>
          <p>
            Demos use fictional fixtures and scripted formatting. They still execute real local sandbox tools and
            record actual backend events.
          </p>
          <label className="field">
            <span>Scenario</span>
            <select
              aria-label="Demo scenario"
              value={selectedScenarioId}
              onChange={(event) => setSelectedScenarioId(event.target.value as Scenario['id'])}
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
          {selectedScenario ? (
            <div className="scenario-card">
              <div className="badge-row">
                <StatusChip tone={statusTone(selectedScenario.expectedStatus)}>
                  {sentenceCase(selectedScenario.expectedStatus)}
                </StatusChip>
              </div>
              <p>{selectedScenario.description}</p>
              {selectedScenario.faultInjection ? <p className="muted-text">{selectedScenario.faultInjection}</p> : null}
            </div>
          ) : null}
          <button className="primary-button" type="button" onClick={() => void handleRecordDemo()} disabled={recordingDemo}>
            {recordingDemo ? 'Starting demo…' : 'Record demo'}
          </button>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Bring in a saved recording</p>
              <h3>Import JSON</h3>
            </div>
            <Upload size={18} />
          </div>
          <p>Import a native Agent Flight Recorder JSON export up to 5 MiB. Identical recordings reopen instead of duplicating data.</p>
          <label className="field" htmlFor="recording-import">
            <span>Recording file</span>
            <input
              id="recording-import"
              type="file"
              accept=".json,application/json"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => void handleImport()} disabled={!importFile || importing}>
            {importing ? 'Importing…' : 'Import recording JSON'}
          </button>
          <p className="muted-text">
            Need a first real recording? Use the local SDK or HTTP capture endpoints from the Connect page.
          </p>
          <a className="text-link" href={pageHash('connect')}>
            Open integration guide
          </a>
        </article>
      </section>

      <section className="panel-card">
        <div className="panel-card-header">
          <div>
            <p className="eyebrow">Search recordings</p>
            <h3>Run list</h3>
          </div>
          <Search size={18} />
        </div>
        <div className="filter-row">
          <label className="field field-inline">
            <span>Search runs</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, agent, scenario, or trace ID"
            />
          </label>
          <label className="field field-inline">
            <span>Status</span>
            <select aria-label="Run status filter" value={status} onChange={(event) => setStatus(event.target.value as RunStatus | '')}>
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="interrupted">Interrupted</option>
            </select>
          </label>
        </div>

        {runsError ? <InlineNotice tone="danger" message={runsError} /> : null}
        {runsLoading ? <LoadingState label="Refreshing run list…" /> : null}
        {!runsLoading && runs.length === 0 && overview.stats.runs === 0 ? (
          <div className="empty-state">
            <h4>No recordings yet</h4>
            <p>Start a demo, import a JSON export, or capture a real local run via the SDK.</p>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => void handleRecordDemo()} disabled={recordingDemo}>
                Record first demo
              </button>
              <a className="secondary-button as-link" href={pageHash('connect')}>
                Capture a real run
              </a>
            </div>
          </div>
        ) : null}
        {!runsLoading && runs.length === 0 && overview.stats.runs > 0 ? (
          <div className="empty-state">
            <h4>No runs match this filter</h4>
            <p>Try a broader search or reset the status filter.</p>
          </div>
        ) : null}
        <div className="run-list" role="list">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">What needs attention</p>
              <h3>Recent findings</h3>
            </div>
            <AlertTriangle size={18} />
          </div>
          {overview.insights.length === 0 ? (
            <p className="muted-text">No insights have been derived from the recorded runs yet.</p>
          ) : (
            <ul className="stacked-list">
              {overview.insights.slice(0, 4).map((insight) => (
                <li key={insight.id}>
                  <a className="list-link" href={runHash(insight.runId, insight.eventSeq ?? undefined)}>
                    <span className="list-link-title">{insight.title}</span>
                    <StatusChip tone={severityTone(insight.severity)}>{sentenceCase(insight.severity)}</StatusChip>
                    <span className="muted-text">{insight.detail}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a className="text-link" href={pageHash('insights')}>
            Open insights
          </a>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Policy surface</p>
              <h3>Recorded local rules</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <ul className="stacked-list">
            {overview.policies.slice(0, 4).map((policy) => (
              <li key={policy.id}>
                <div className="list-link static">
                  <span className="list-link-title">{policy.name}</span>
                  <StatusChip tone={policyTone(policy.outcome)}>{sentenceCase(policy.outcome)}</StatusChip>
                  <span className="muted-text">{policy.tool}</span>
                </div>
              </li>
            ))}
          </ul>
          <a className="text-link" href={pageHash('policies')}>
            Open policy reference
          </a>
        </article>
      </section>
    </section>
  );
}

function RunRow({ run }: { run: Run }) {
  return (
    <a className="run-row" href={runHash(run.id)}>
      <div className="run-row-main">
        <div className="run-row-heading">
          <h4>{run.name}</h4>
          <StatusChip tone={statusTone(run.status)}>{sentenceCase(run.status)}</StatusChip>
          <StatusChip tone="neutral">{originLabel(run.origin)}</StatusChip>
          {run.readOnly ? <StatusChip tone="warning">Read-only</StatusChip> : null}
        </div>
        <p className="muted-text">
          {run.agentName}
          {run.scenarioId ? ` · Scenario: ${run.scenarioId}` : ''}
          {run.parentRunId ? ` · Forked from ${truncate(run.parentRunId, 14)}` : ''}
        </p>
      </div>
      <dl className="run-metrics">
        <div>
          <dt>Origin</dt>
          <dd>{originLabel(run.origin)}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{formatDuration(run.metrics.durationMs)}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>{run.metrics.toolCalls}</dd>
        </div>
        <div>
          <dt>Retries</dt>
          <dd>{run.metrics.retries}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt>Trace</dt>
          <dd>{truncate(run.traceId, 18)}</dd>
        </div>
      </dl>
    </a>
  );
}

function RunDetailPage({
  runId,
  initialEventSeq,
  showFlash,
}: {
  runId: string;
  initialEventSeq: number | null;
  showFlash: (message: string, tone?: NoticeTone) => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [forkScenarioId, setForkScenarioId] = useState<Scenario['id']>('success');
  const [forking, setForking] = useState(false);
  const [reviewer, setReviewer] = useState('Local reviewer');
  const [approvalComment, setApprovalComment] = useState('');
  const [resolvingApproval, setResolvingApproval] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [breakOnIssues, setBreakOnIssues] = useState(true);
  const [followLive, setFollowLive] = useState(false);
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all');
  const [enabledTypes, setEnabledTypes] = useState<Set<TraceEvent['type']>>(new Set());
  const replayRequestRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const initializedRunRef = useRef<string | null>(null);
  const knownTypesRef = useRef(new Set<TraceEvent['type']>());
  const appliedEventRef = useRef<number | null>(initialEventSeq);
  const playbackEventsRef = useRef<TraceEvent[]>([]);
  const liveOptionsRef = useRef({ followLive, playing });
  playbackEventsRef.current = detail?.events ?? [];
  liveOptionsRef.current = { followLive, playing };
  const eventCount = detail?.events.length ?? 0;
  const liveUpdatable = detail ? isLiveUpdatableRun(detail.run) : false;

  const loadDetail = async (signal?: AbortSignal) => {
    const [detailResponse, scenariosResponse, runsResponse] = await Promise.all([
      api.getRunDetail(runId, signal),
      api.getScenarios(signal),
      api.getRuns({}, signal),
    ]);
    return { detailResponse, scenariosResponse, runsResponse };
  };

  useEffect(() => {
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    loadDetail(controller.signal)
      .then(({ detailResponse, scenariosResponse, runsResponse }) => {
        setDetail(detailResponse);
        setScenarios(scenariosResponse.scenarios);
        setAllRuns(runsResponse.runs);
        setForkScenarioId((current) => scenariosResponse.scenarios.some((scenario) => scenario.id === current) ? current : detailResponse.run.scenarioId ?? scenariosResponse.scenarios[0]?.id ?? 'success');
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setDetailError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [runId]);

  useEffect(() => {
    if (!liveUpdatable) return undefined;
    const controller = new AbortController();
    let inFlight = false;
    const intervalId = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      api
        .getRunDetail(runId, controller.signal)
        .then((nextDetail) => {
          if (controller.signal.aborted) return;
          setPollError(null);
          setDetail(nextDetail);
          if (liveOptionsRef.current.followLive && !liveOptionsRef.current.playing) {
            setCursor(nextDetail.events.length);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) setPollError(getErrorMessage(error));
        })
        .finally(() => { inFlight = false; });
    }, 1200);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [liveUpdatable, runId]);

  useEffect(() => {
    if (!detail) return;
    const types = [...new Set(detail.events.map((event) => event.type))];
    const previousTypes = knownTypesRef.current;
    knownTypesRef.current = new Set(types);
    setEnabledTypes((current) => new Set(types.filter((type) => current.has(type) || !previousTypes.has(type))));
  }, [detail]);

  useEffect(() => {
    if (!detail) return;
    if (initializedRunRef.current !== detail.run.id) {
      initializedRunRef.current = detail.run.id;
      appliedEventRef.current = initialEventSeq;
      const nextCursor = clamp(initialEventSeq ?? detail.events.length, 0, detail.events.length);
      setCursor(nextCursor);
      setFollowLive(initialEventSeq === null && isLiveUpdatableRun(detail.run));
      setPlaying(false);
      setSelectedComparison('');
      setComparison(null);
      setComparisonError(null);
      return;
    }
    if (initialEventSeq !== appliedEventRef.current) {
      appliedEventRef.current = initialEventSeq;
      setCursor(clamp(initialEventSeq ?? detail.events.length, 0, detail.events.length));
      setFollowLive(initialEventSeq === null && isLiveUpdatableRun(detail.run));
      setPlaying(false);
      return;
    }
    setCursor((current) => clamp(current, 0, detail.events.length));
  }, [detail, initialEventSeq]);

  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController();
    const requestId = ++replayRequestRef.current;
    setReplayLoading(true);
    setReplayError(null);

    api
      .getReplay(runId, clamp(cursor, 0, detail.events.length), controller.signal)
      .then((response) => {
        if (requestId !== replayRequestRef.current) return;
        setReplay(response);
      })
      .catch((loadError) => {
        if (controller.signal.aborted || requestId !== replayRequestRef.current) return;
        setReplayError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === replayRequestRef.current) setReplayLoading(false);
      });

    return () => controller.abort();
  }, [cursor, eventCount, runId]);

  useEffect(() => {
    const timeline = timelineRef.current;
    const selected = replay?.event?.seq;
    if (!timeline || selected === undefined) return;
    const row = timeline.querySelector<HTMLButtonElement>(`[data-event-seq="${selected}"]`);
    if (!row) return;
    const bounds = timeline.getBoundingClientRect();
    const item = row.getBoundingClientRect();
    if (item.top < bounds.top) timeline.scrollTop += item.top - bounds.top - 8;
    else if (item.bottom > bounds.bottom) timeline.scrollTop += item.bottom - bounds.bottom + 8;
  }, [replay?.event?.seq]);

  useEffect(() => {
    if (!playing || eventCount === 0) return undefined;
    if (cursor >= eventCount) {
      setPlaying(false);
      return undefined;
    }
    const delay = speed === 0.5 ? 1600 : speed === 1 ? 900 : speed === 2 ? 450 : 225;
    const timeoutId = window.setTimeout(() => {
      const nextCursor = clamp(cursor + 1, 0, eventCount);
      const nextEvent = playbackEventsRef.current.find((event) => event.seq === nextCursor) ?? null;
      setCursor(nextCursor);
      if (nextCursor >= eventCount || (breakOnIssues && nextEvent && isBreakpointEvent(nextEvent))) {
        setPlaying(false);
        setFollowLive(false);
      }
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [breakOnIssues, cursor, eventCount, playing, speed]);

  useEffect(() => {
    if (!selectedComparison) {
      setComparison(null);
      setComparisonError(null);
      return;
    }
    const controller = new AbortController();
    setComparisonLoading(true);
    setComparisonError(null);
    api
      .getComparison(runId, selectedComparison, controller.signal)
      .then((response) => setComparison(response))
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setComparisonError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonLoading(false);
      });
    return () => controller.abort();
  }, [runId, selectedComparison]);

  const manualSeek = (nextCursor: number) => {
    const maxCursor = detail?.events.length ?? nextCursor;
    setPlaying(false);
    setFollowLive(false);
    setCursor(clamp(nextCursor, 0, maxCursor));
  };

  const openEvent = (eventSeq: number) => {
    manualSeek(eventSeq);
    window.location.hash = runHash(runId, eventSeq);
  };

  const handleApproval = async (decision: 'approve' | 'reject') => {
    const pendingApproval = detail?.approvals.find((approval) => approval.status === 'pending');
    if (!pendingApproval) {
      showFlash('This run no longer has a pending approval.', 'danger');
      return;
    }
    if (reviewer.trim().length < 2) {
      showFlash('Enter a reviewer label of at least two characters.', 'danger');
      return;
    }
    setResolvingApproval(true);
    try {
      const response = await api.resolveApproval(
        pendingApproval.id,
        decision,
        reviewer.trim(),
        approvalComment.trim() || undefined,
      );
      showFlash(
        decision === 'approve'
          ? 'Approval recorded. The sandbox run may now continue to the local outbox step.'
          : 'Rejection recorded. The sandbox run remains blocked from delivery.',
        'success',
      );
      const updatedDetail = await api.getRunDetail(response.runId);
      setDetail(updatedDetail);
      setCursor((current) => clamp(current, 0, updatedDetail.events.length));
    } catch (approvalError) {
      showFlash(getErrorMessage(approvalError), 'danger');
    } finally {
      setResolvingApproval(false);
    }
  };

  const handleFork = async () => {
    if (!detail) return;
    setForking(true);
    try {
      const response = await api.forkRun(detail.run.id, forkScenarioId);
      showFlash('Started a new sandbox rerun. Replay remains read-only; reruns execute local tools again.', 'success');
      window.location.hash = runHash(response.runId);
    } catch (forkError) {
      showFlash(getErrorMessage(forkError), 'danger');
    } finally {
      setForking(false);
    }
  };

  const availableComparisonRuns = useMemo(
    () => allRuns.filter((run) => run.id !== detail?.run.id),
    [allRuns, detail?.run.id],
  );

  const filteredEvents = useMemo(() => {
    if (!detail) return [];
    return detail.events.filter((event) => enabledTypes.has(event.type) && focusMatches(focusFilter, event));
  }, [detail, enabledTypes, focusFilter]);

  const eventDepths = useMemo(() => {
    if (!detail) return new Map<number, number>();
    const spanDepth = new Map<string, number>();
    const depths = new Map<number, number>();
    detail.events.forEach((event) => {
      const parentDepth = event.parentSpanId ? spanDepth.get(event.parentSpanId) ?? 0 : 0;
      const depth = event.parentSpanId ? parentDepth + 1 : 0;
      depths.set(event.seq, depth);
      if (event.spanId) {
        spanDepth.set(event.spanId, depth);
      }
    });
    return depths;
  }, [detail]);

  const maxDuration = useMemo(
    () => Math.max(1, ...filteredEvents.map((event) => event.durationMs ?? 0)),
    [filteredEvents],
  );

  if (detailLoading) {
    return <LoadingState />;
  }

  if (detailError || !detail) {
    return (
      <ErrorState
        message={detailError ?? 'Failed to load run details.'}
        retry={() => {
          setDetailLoading(true);
          setDetailError(null);
          loadDetail()
            .then(({ detailResponse, scenariosResponse, runsResponse }) => {
              setDetail(detailResponse);
              setScenarios(scenariosResponse.scenarios);
              setAllRuns(runsResponse.runs);
            })
            .catch((loadError) => setDetailError(getErrorMessage(loadError)))
            .finally(() => setDetailLoading(false));
        }}
      />
    );
  }

  const pendingApproval = detail.approvals.find((approval) => approval.status === 'pending') ?? null;
  const selectedEvent = replay?.event ?? null;

  return (
    <section className="page-stack run-detail-page">
      <header className="page-header">
        <div>
          <a className="text-link back-link" href={recordingsHash()}>
            <ArrowLeft size={16} />
            Back to recordings
          </a>
          <p className="eyebrow">Trace detail</p>
          <h2>{detail.run.name}</h2>
          <p className="page-summary">
            Trace ID {detail.run.traceId} · Agent {detail.run.agentName} · Started {formatDateTime(detail.run.startedAt)}
          </p>
        </div>
        <div className="badge-row">
          <StatusChip tone={statusTone(detail.run.status)}>{sentenceCase(detail.run.status)}</StatusChip>
          <StatusChip tone={detail.run.origin === 'demo' ? 'accent' : 'neutral'}>{originLabel(detail.run.origin)}</StatusChip>
          {detail.run.readOnly ? <StatusChip tone="warning">Imported read-only</StatusChip> : null}
          {pendingApproval ? <button className="primary-button" type="button" onClick={() => {
            document.getElementById('pending-approval-heading')?.focus();
          }}>Review pending action</button> : null}
          <a className="secondary-button as-link" href={`/api/runs/${encodeURIComponent(detail.run.id)}/export?format=json`} download>
            <Download size={16} /> Export JSON
          </a>
        </div>
      </header>
      {pollError ? <InlineNotice tone="danger" message={`Live updates failed: ${pollError}. Retrying automatically.`} /> : null}

      <section className="stats-grid run-summary">
        <StatCard icon={<Activity size={18} />} label="Events" value={String(detail.events.length)} detail="Actual recorded event count" />
        <StatCard icon={<Bot size={18} />} label="Tool calls" value={String(detail.run.metrics.toolCalls)} />
        <StatCard icon={<AlertTriangle size={18} />} label="Errors" value={String(detail.run.metrics.errors)} />
        <StatCard icon={<RefreshCw size={18} />} label="Retries" value={String(detail.run.metrics.retries)} />
        <StatCard icon={<Clock3 size={18} />} label="Duration" value={formatDuration(detail.run.metrics.durationMs)} />
        <StatCard icon={<ShieldCheck size={18} />} label="Approvals" value={String(detail.run.metrics.approvals)} />
      </section>

      <section className="panel-grid detail-top-grid run-metadata">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Recording integrity</p>
              <h3>Hash-chain consistency</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="badge-row">
            <StatusChip tone={detail.integrity.valid ? 'success' : 'danger'}>
              {detail.integrity.valid ? 'Consistent' : 'Inconsistent'}
            </StatusChip>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Checked events</dt>
              <dd>{detail.integrity.checkedEvents}</dd>
            </div>
            <div>
              <dt>Root hash</dt>
              <dd className="mono-text">{truncate(detail.integrity.rootHash, 32)}</dd>
            </div>
          </dl>
          <p className="muted-text">
            Consistency check only. This verifies the recorded hash chain, not authenticated tamper-proof storage.
          </p>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Exports</p>
              <h3>Download this recording</h3>
            </div>
            <Download size={18} />
          </div>
          <div className="button-row">
            <a className="secondary-button as-link" href={`/api/runs/${encodeURIComponent(detail.run.id)}/export?format=json`} download>
              <FileJson size={16} />
              JSON
            </a>
            <a className="secondary-button as-link" href={`/api/runs/${encodeURIComponent(detail.run.id)}/export?format=markdown`} download>
              <FileText size={16} />
              Markdown
            </a>
            <a className="secondary-button as-link" href={`/api/runs/${encodeURIComponent(detail.run.id)}/export?format=otlp`} download>
              <Waypoints size={16} />
              OTLP
            </a>
          </div>
          <p className="muted-text">Exports preserve what was recorded. Replay never re-executes tools or approvals.</p>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Tool summary</p>
              <h3>Measured work</h3>
            </div>
            <Gauge size={18} />
          </div>
          {detail.tools.length === 0 ? (
            <p className="muted-text">No tools were executed in this recording.</p>
          ) : (
            <ul className="stacked-list">
              {detail.tools.map((tool) => (
                <li key={tool.name}>
                  <div className="list-link static">
                    <span className="list-link-title">{tool.name}</span>
                    <span>{tool.calls} calls</span>
                    <span className="muted-text">
                      {tool.failures} failures · avg {formatDuration(tool.averageDurationMs)} · total{' '}
                      {formatDuration(tool.totalDurationMs)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {pendingApproval ? (
        <section className="panel-card approval-panel" aria-labelledby="pending-approval-heading">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Human gate</p>
              <h3 id="pending-approval-heading" tabIndex={-1}>Pending approval</h3>
            </div>
            <Mail size={18} />
          </div>
          <p>
            Explicit approval is required before this sandbox action can continue. Approval affects only the local
            outbox flow and never sends a real email.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Tool</dt>
              <dd>{pendingApproval.tool}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{pendingApproval.policyId}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{pendingApproval.reason}</dd>
            </div>
          </dl>
          <JsonBlock title="Pending tool input" value={pendingApproval.input} />
          <div className="filter-row">
            <label className="field field-inline">
              <span>Reviewer</span>
              <input minLength={2} maxLength={100} value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
            </label>
            <label className="field field-inline">
              <span>Comment</span>
              <input maxLength={1000} value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} placeholder="Optional reviewer note" />
            </label>
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleApproval('approve')}
              disabled={resolvingApproval}
            >
              Approve action
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => void handleApproval('reject')}
              disabled={resolvingApproval}
            >
              Reject action
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel-grid detail-top-grid run-actions">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Replay controls</p>
              <h3>Chronological debugging</h3>
            </div>
            <Play size={18} />
          </div>
          <p className="muted-text">Read-only replay · no tools re-executed.</p>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => manualSeek(Math.max(0, cursor - 1))} disabled={cursor === 0}>
              <SkipBack size={16} />
              Previous
            </button>
            <button className="primary-button" type="button" onClick={() => {
              if (!playing && cursor >= eventCount) setCursor(0);
              setFollowLive(false);
              setPlaying((current) => !current);
            }} disabled={detail.events.length === 0}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => manualSeek(Math.min(detail.events.length, cursor + 1))}
              disabled={cursor >= detail.events.length}
            >
              <SkipForward size={16} />
              Next
            </button>
            <button className="secondary-button" type="button" onClick={() => manualSeek(0)}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
          <div className="filter-row">
            <label className="field field-inline">
              <span>Playback speed</span>
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as ReplaySpeed)}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={breakOnIssues} onChange={(event) => setBreakOnIssues(event.target.checked)} />
              <span>Break on errors and policies</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={followLive}
                disabled={!isLiveUpdatableRun(detail.run)}
                onChange={(event) => {
                  setFollowLive(event.target.checked);
                  if (event.target.checked) {
                    setPlaying(false);
                    setCursor(eventCount);
                  }
                }}
              />
              <span>Follow newest live event</span>
            </label>
          </div>
          <label className="field">
            <span>
              Replay position <strong>{cursor}</strong> / {detail.events.length}
            </span>
            <input
              aria-label="Replay position"
              type="range"
              min={0}
              max={detail.events.length}
              value={cursor}
              onChange={(event) => manualSeek(Number(event.target.value))}
            />
          </label>
          {replayError ? <InlineNotice tone="danger" message={replayError} /> : null}
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">What-if rerun</p>
              <h3>Execute a new sandbox run</h3>
            </div>
            <FlaskConical size={18} />
          </div>
          {detail.run.origin === 'demo' ? (
            <>
              <p>
                Reruns are new sandbox executions linked by <code>parentRunId</code>. They can execute the local demo
                tools again, unlike replay.
              </p>
              <label className="field">
                <span>Scenario for rerun</span>
                <select value={forkScenarioId} onChange={(event) => setForkScenarioId(event.target.value as Scenario['id'])}>
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" type="button" onClick={() => void handleFork()} disabled={forking}>
                {forking ? 'Starting rerun…' : 'Start rerun'}
              </button>
            </>
          ) : (
            <p className="muted-text">
              Only scripted demo runs can be re-executed here. SDK captures and imported recordings stay read-only.
            </p>
          )}
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Derived comparison</p>
              <h3>Compare with another run</h3>
            </div>
            <GitCompareArrows size={18} />
          </div>
          <label className="field">
            <span>Comparison run</span>
            <select value={selectedComparison} onChange={(event) => setSelectedComparison(event.target.value)}>
              <option value="">Choose another recording</option>
              {availableComparisonRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} · {sentenceCase(run.status)}
                </option>
              ))}
            </select>
          </label>
          {comparisonLoading ? <LoadingState label="Calculating comparison…" /> : null}
          {comparisonError ? <InlineNotice tone="danger" message={comparisonError} /> : null}
          {comparison ? <ComparisonView comparison={comparison} /> : null}
        </article>
      </section>

      {detail.deliveries.length > 0 ? (
        <section className="panel-card outbox-panel">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Sandbox deliveries</p>
              <h3>Local outbox receipts</h3>
            </div>
            <Mail size={18} />
          </div>
          <p className="muted-text">Local outbox only. No SMTP, Graph, or real email delivery occurs from this UI.</p>
          <ul className="stacked-list">
            {detail.deliveries.map((delivery) => (
              <li key={delivery.id}>
                <div className="list-link static">
                  <span className="list-link-title">{delivery.subject}</span>
                  <span>{delivery.recipient}</span>
                  <span>{delivery.body}</span>
                  <span className="muted-text mono-text">Receipt: {delivery.id}</span>
                  <span className="muted-text">
                    {formatDateTime(delivery.createdAt)} · {delivery.disclaimer}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="detail-main-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Timeline</p>
              <h3>Recorded events</h3>
            </div>
            <Activity size={18} />
          </div>
          <div className="timeline-toolbar">
            <div className="quick-filter-row" role="group" aria-label="Timeline quick filters">
              {(['all', 'errors', 'policies', 'approvals', 'tools', 'models'] as FocusFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`filter-chip${focusFilter === filter ? ' is-active' : ''}`}
                  onClick={() => setFocusFilter(filter)}
                >
                  <Filter size={14} />
                  {sentenceCase(filter)}
                </button>
              ))}
            </div>
            <div className="type-filter-grid" role="group" aria-label="Event type filters">
              {[...new Set(detail.events.map((event) => event.type))].map((eventType) => (
                <label key={eventType} className="checkbox-field compact">
                  <input
                    type="checkbox"
                    checked={enabledTypes.has(eventType)}
                    onChange={(event) => {
                      setEnabledTypes((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(eventType);
                        else next.delete(eventType);
                        return next;
                      });
                    }}
                  />
                  <span>{formatEventType(eventType)}</span>
                </label>
              ))}
            </div>
          </div>
          <p className="muted-text">
            Showing {filteredEvents.length} of {detail.events.length} recorded events.
          </p>
          <div className="timeline-list" role="list" ref={timelineRef}>
            {filteredEvents.map((event) => {
              const depth = eventDepths.get(event.seq) ?? 0;
              const waterfall = event.durationMs ? Math.max(8, (event.durationMs / maxDuration) * 100) : 0;
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`timeline-row${selectedEvent?.seq === event.seq ? ' is-selected' : ''}`}
                  onClick={() => openEvent(event.seq)}
                  style={{ ['--event-depth' as string]: String(depth), ['--waterfall-width' as string]: `${waterfall}%` }}
                  aria-label={`${formatEventType(event.type)} ${event.name}, event ${event.seq}`}
                  data-event-seq={event.seq}
                >
                  <div className="timeline-seq">{event.seq}</div>
                  <div className="timeline-body">
                    <div className="timeline-body-header">
                      <strong>{event.name}</strong>
                      <span>{formatEventType(event.type)}</span>
                    </div>
                    <div className="timeline-meta">
                      <span>{formatTime(event.timestamp)}</span>
                      <span>{event.durationMs === null ? 'No measured duration' : formatDuration(event.durationMs)}</span>
                      {event.error ? <StatusChip tone="danger">Error</StatusChip> : null}
                      {event.type.startsWith('policy.') ? <StatusChip tone="warning">Policy</StatusChip> : null}
                      {event.type.startsWith('approval.') ? <StatusChip tone="warning">Approval</StatusChip> : null}
                    </div>
                    <div className="waterfall-track" aria-hidden="true">
                      {event.durationMs ? <span className="waterfall-bar" /> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel-card inspector-panel">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Inspector</p>
              <h3>{selectedEvent ? `${selectedEvent.name} · event ${selectedEvent.seq}` : 'Initial replay state'}</h3>
            </div>
            <Bot size={18} />
          </div>
          {replayLoading ? <LoadingState label="Reconstructing recorded state…" /> : null}
          {selectedEvent ? (
            <>
              <section className="inspector-section">
                <h4>Event payload</h4>
                <dl className="detail-list">
                  <div>
                    <dt>Type</dt>
                    <dd>{formatEventType(selectedEvent.type)}</dd>
                  </div>
                  <div>
                    <dt>Timestamp</dt>
                    <dd>{formatDateTime(selectedEvent.timestamp)}</dd>
                  </div>
                  <div>
                    <dt>Span</dt>
                    <dd className="mono-text">{selectedEvent.spanId ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Parent span</dt>
                    <dd className="mono-text">{selectedEvent.parentSpanId ?? '—'}</dd>
                  </div>
                </dl>
                <JsonBlock title="Input" value={selectedEvent.input} />
                <JsonBlock title="Output" value={selectedEvent.output} />
                <JsonBlock title="Error" value={selectedEvent.error} />
                <JsonBlock title="Attributes" value={selectedEvent.attributes} />
                <JsonBlock title="State delta" value={selectedEvent.stateDelta} />
                <JsonBlock title="Redacted paths" value={selectedEvent.redactedPaths} emptyLabel="No redacted paths recorded." />
              </section>
            </>
          ) : (
            <p className="muted-text">Cursor 0 shows the empty initial replay state before any recorded event.</p>
          )}
          <section className="inspector-section">
            <h4>Recorded state</h4>
            {replay ? (
              <>
                <JsonBlock title="Context" value={replay.snapshot.context} />
                <JsonBlock title="Messages" value={replay.snapshot.messages} />
                <JsonBlock title="Tool outputs" value={replay.snapshot.toolOutputs} />
                <JsonBlock title="Failures" value={replay.snapshot.failures} />
                <JsonBlock title="Last output" value={replay.snapshot.lastOutput} />
                <JsonBlock title="Last policy" value={replay.snapshot.lastPolicy} />
                <JsonBlock title="Pending approval" value={replay.snapshot.pendingApproval} />
              </>
            ) : (
              <p className="muted-text">Replay snapshot unavailable.</p>
            )}
          </section>
        </article>
      </section>
    </section>
  );
}

function ComparisonView({ comparison }: { comparison: Comparison }) {
  return (
    <div className="comparison-stack">
      <div className="badge-row">
        <StatusChip tone="info">Derived outcome delta</StatusChip>
        <StatusChip tone="neutral">Selected run minus current run</StatusChip>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Duration Δ</dt>
          <dd>{formatDuration(comparison.delta.durationMs)}</dd>
        </div>
        <div>
          <dt>Tool calls Δ</dt>
          <dd>{comparison.delta.toolCalls >= 0 ? '+' : ''}{comparison.delta.toolCalls}</dd>
        </div>
        <div>
          <dt>Errors Δ</dt>
          <dd>{comparison.delta.errors >= 0 ? '+' : ''}{comparison.delta.errors}</dd>
        </div>
        <div>
          <dt>Retries Δ</dt>
          <dd>{comparison.delta.retries >= 0 ? '+' : ''}{comparison.delta.retries}</dd>
        </div>
      </dl>
      <ul className="stacked-list">
        {comparison.changes.map((change) => (
          <li key={change.label}>
            <div className="comparison-change">
              <strong>{change.label}</strong>
              <span className="muted-text">Current run: {change.left}</span>
              <span className="muted-text">Selected run: {change.right}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await api.getOverview());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState />;
  if (error || !overview) return <ErrorState message={error ?? 'Failed to load insights.'} retry={() => void load()} />;

  const failedRuns = overview.runs.filter((run) => run.status === 'failed' || run.status === 'interrupted');
  const blockedRuns = overview.runs.filter((run) => run.status === 'blocked');
  const waitingRuns = overview.runs.filter((run) => !run.readOnly && run.status === 'awaiting_approval');
  const retryRuns = overview.runs.filter((run) => run.metrics.retries > 0);
  const longestRuns = [...overview.runs].sort((left, right) => right.metrics.durationMs - left.metrics.durationMs).slice(0, 5);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Derived findings</p>
          <h2>Failure and performance insights</h2>
          <p className="page-summary">Surface the runs and events that explain retries, slowdowns, blocked actions, and approval waits.</p>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard icon={<AlertTriangle size={18} />} label="Failed runs" value={String(failedRuns.length)} />
        <StatCard icon={<ShieldAlert size={18} />} label="Blocked runs" value={String(blockedRuns.length)} />
        <StatCard icon={<Mail size={18} />} label="Approval waits" value={String(waitingRuns.length)} />
        <StatCard icon={<RefreshCw size={18} />} label="Runs with retries" value={String(retryRuns.length)} />
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Linked findings</p>
              <h3>Actionable insights</h3>
            </div>
            <Gauge size={18} />
          </div>
          {overview.insights.length === 0 ? (
            <p className="muted-text">Insights will appear after runs record failures, retries, policy outcomes, or slow work.</p>
          ) : (
            <ul className="stacked-list">
              {overview.insights.map((insight) => (
                <li key={insight.id}>
                  <a className="list-link" href={runHash(insight.runId, insight.eventSeq ?? undefined)}>
                    <span className="list-link-title">{insight.title}</span>
                    <StatusChip tone={severityTone(insight.severity)}>{sentenceCase(insight.severity)}</StatusChip>
                    <span className="muted-text">{insight.detail}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Longest traces</p>
              <h3>Performance outliers</h3>
            </div>
            <Clock3 size={18} />
          </div>
          <ul className="stacked-list">
            {longestRuns.map((run) => (
              <li key={run.id}>
                <a className="list-link" href={runHash(run.id)}>
                  <span className="list-link-title">{run.name}</span>
                  <StatusChip tone={statusTone(run.status)}>{sentenceCase(run.status)}</StatusChip>
                  <span className="muted-text">
                    {formatDuration(run.metrics.durationMs)} · {run.metrics.toolCalls} tool calls · {run.metrics.retries} retries
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </section>
  );
}

function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getPolicies();
      setPolicies(response.policies);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Fixed local policy rules</p>
          <h2>Policy reference</h2>
          <p className="page-summary">
            These are the sandbox rules recorded by the local demo runner. They explain allow, deny, and approval-required
            outcomes; they are not cloud controls or editable governance settings.
          </p>
        </div>
      </header>
      <div className="inline-note">
        <ShieldAlert size={18} />
        <p>Local-only scope. No Azure, Foundry, or remote policy service is connected in this prototype.</p>
      </div>
      <div className="policy-grid">
        {policies.map((policy) => (
          <article key={policy.id} className="panel-card">
            <div className="panel-card-header">
              <div>
                <p className="eyebrow">{policy.id}</p>
                <h3>{policy.name}</h3>
              </div>
              <StatusChip tone={policyTone(policy.outcome)}>{sentenceCase(policy.outcome)}</StatusChip>
            </div>
            <p>{policy.description}</p>
            <dl className="detail-list">
              <div>
                <dt>Tool</dt>
                <dd>{policy.tool}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>{sentenceCase(policy.outcome)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ConnectPage({ showFlash }: { showFlash: (message: string, tone?: NoticeTone) => void }) {
  const [health, setHealth] = useState<{
    status: 'ok';
    name: string;
    version: string;
    modelMode: 'scripted-demo';
    mcpPath: '/mcp';
    collectorUrl: string;
    persistent?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await api.getHealth());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const collectorUrl = health?.collectorUrl ?? 'http://127.0.0.1:4180';
  const mcpUrl = `${collectorUrl}${health?.mcpPath ?? '/mcp'}`;
  const integrationSnippet = `import { FlightRecorder } from './sdk/recorder.mjs';

const recorder = new FlightRecorder({ baseUrl: '${collectorUrl}' });
await recorder.run({ name: 'My agent', agentName: 'custom-agent', input: { prompt: '...' } }, async run => {
  await run.prompt('...');
  const result = await run.tool('Lookup', { id: 42 }, async () => ({ answer: 'example' }));
  await run.decision('Return the tool result', { result });
  return result;
});`;

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(integrationSnippet);
      showFlash('Integration snippet copied to the clipboard.', 'success');
    } catch (copyError) {
      showFlash(getErrorMessage(copyError), 'danger');
    }
  };

  if (loading) return <LoadingState />;
  if (error || !health) return <ErrorState message={error ?? 'Failed to load connection details.'} retry={() => void load()} />;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Integrate real local agents</p>
          <h2>Connect capture, replay, and export</h2>
          <p className="page-summary">
            Instrument your own Node agent with the local capture SDK, post events over HTTP, read recordings through MCP,
            and export JSON or OTLP without claiming any cloud connection.
          </p>
        </div>
      </header>

      <div className="inline-note">
        <Plug size={18} />
        <p>No live Foundry, Azure OpenAI, or hosted cloud agent connection is configured here. This is a local recorder.</p>
      </div>

      <section className="stats-grid">
        <StatCard icon={<CheckCircle2 size={18} />} label="Health" value={health.status} />
        <StatCard icon={<Bot size={18} />} label="Model mode" value={health.modelMode} detail="Scripted demo only" />
        <StatCard icon={<Plug size={18} />} label="Collector URL" value={collectorUrl} />
        <StatCard icon={<Shield size={18} />} label="MCP path" value={health.mcpPath} detail="Read-only endpoint" />
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Node SDK</p>
              <h3>sdk/recorder.mjs</h3>
            </div>
            <Bot size={18} />
          </div>
          <p>
            The framework-neutral SDK exports <code>FlightRecorder</code>. Wrap prompts, tools, outputs, errors,
            retries, and explicit decisions. Explicit annotations improve observability but do not expose hidden
            chain-of-thought.
          </p>
          <div className="code-panel">
            <div className="code-panel-header">
              <span>Copyable integration snippet</span>
              <button className="ghost-button" type="button" onClick={() => void copySnippet()}>
                <Copy size={16} />
                Copy
              </button>
            </div>
            <pre className="json-block code-snippet">{integrationSnippet}</pre>
          </div>
          <p className="muted-text">Redaction is best effort. Review recordings before sharing exported data.</p>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">HTTP capture endpoints</p>
              <h3>Direct collector ingestion</h3>
            </div>
            <Upload size={18} />
          </div>
          <ul className="stacked-list">
            <li><div className="list-link static"><span className="list-link-title">POST /api/capture/runs</span><span>Create a new recorded run and receive a write token.</span></div></li>
            <li><div className="list-link static"><span className="list-link-title">POST /api/capture/runs/:id/events</span><span>Append prompts, decisions, tool/model activity, policy events, and outputs.</span></div></li>
            <li><div className="list-link static"><span className="list-link-title">POST /api/capture/runs/:id/finish</span><span>Finalize status and output without replaying or re-running anything.</span></div></li>
          </ul>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Read-only tools</p>
              <h3>MCP and exports</h3>
            </div>
            <Waypoints size={18} />
          </div>
          <ul className="stacked-list">
            <li><div className="list-link static"><span className="list-link-title">MCP endpoint</span><span>{mcpUrl}</span></div></li>
            <li><div className="list-link static"><span className="list-link-title">JSON export</span><span>Native importable recording format.</span></div></li>
            <li><div className="list-link static"><span className="list-link-title">Markdown export</span><span>Human-readable incident-free trace report.</span></div></li>
            <li><div className="list-link static"><span className="list-link-title">OTLP export</span><span>Trace projection for observability tooling; not OTLP ingestion.</span></div></li>
          </ul>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <p className="eyebrow">Backend health</p>
              <h3>Known recorder fields</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{health.name}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{health.version}</dd>
            </div>
            <div>
              <dt>Collector URL</dt>
              <dd>{collectorUrl}</dd>
            </div>
            <div>
              <dt>MCP path</dt>
              <dd>{health.mcpPath}</dd>
            </div>
            <div>
              <dt>MCP endpoint</dt>
              <dd>{mcpUrl}</dd>
            </div>
          </dl>
        </article>
      </section>
    </section>
  );
}

export default App;
