import type { ExampleId } from './catalog.ts';
export type Verdict = 'Supported' | 'Contradicted' | 'Unsupported' | 'Unverifiable';
export type Scope = {
  repositoryId?: string;
  codeVersion?: string;
  resourceId?: string;
  environment?: string;
  queryScope?: string;
  suite?: string;
};
export type AssetKind = 'agent' | 'skill' | 'instruction' | 'mcp-server' | 'mcp-tool' | 'tool' | 'resource' | 'repository';
export interface InventoryItem {
  kind: AssetKind;
  id: string;
  name: string;
  version: string | null;
  available: boolean;
  usedBy: string[];
}
export interface SourceHealth {
  id: string;
  version: string | null;
  status: 'imported' | 'capturing' | 'disabled' | 'unavailable' | 'partial';
  detail: string;
  capabilities: string[];
}
export interface CaptureGap { code: string; detail: string; eventId?: string }
export interface Observation {
  kind: 'test' | 'action' | 'health' | 'citation';
  outcome: 'passed' | 'failed' | 'succeeded' | 'healthy' | 'unhealthy' | 'denied' | 'unknown';
  exitCode?: number | null;
  passed?: number;
  failed?: number;
  sourceId?: string;
  sourceVersion?: string;
  excerpt?: string;
  excerptHash?: string;
}
export interface Claim {
  kind: Observation['kind'];
  text: string;
  evidenceIds: string[];
  appliesTo: 'final' | 'captured';
  quote?: string;
}
export interface Checkpoint {
  harness: string;
  version: number;
  boundary: string;
  state: { fixture: string; revision: string; environment: string };
  stateHash: string;
}
export interface LensEvent {
  id: string;
  seq: number;
  timestamp: string;
  type: 'run.started' | 'run.finished' | 'context.snapshot' | 'tool.started' | 'tool.result' | 'claim' | 'inventory' | 'checkpoint' | 'capture.gap' | 'note';
  name: string;
  parents: string[];
  scope: Scope;
  observation?: Observation;
  claim?: Claim;
  checkpoint?: Checkpoint;
  assetIds: string[];
  content?: { input?: unknown; output?: unknown };
  model?: {
    deployment: string; model: string; responseId: string; durationMs: number; streamedDeltas: number;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  };
  sourceEventId?: string;
  sourceSeq?: number;
}
export interface LensRecording {
  format: 'agent-evidence-lens';
  version: 1;
  run: {
    id: string;
    name: string;
    agent: string;
    startedAt: string;
    endedAt: string | null;
    status: 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'blocked' | 'interrupted';
    parentRunId: string | null;
    synthetic: boolean;
  };
  adapter: { id: string; version: number; mode: 'import' | 'live' | 'mock' };
  contentCapture: 'minimized' | 'included';
  finalScope: Scope;
  inventory: InventoryItem[];
  sources: SourceHealth[];
  gaps: CaptureGap[];
  events: LensEvent[];
  provenance: {
    sourceRunId: string | null;
    sourceRootHash: string | null;
    restartedFrom: string | null;
  };
  integrity: { algorithm: 'sha256'; digest: string };
}
export interface Finding {
  id: string;
  eventId: string;
  seq: number;
  claim: string;
  kind: Observation['kind'];
  verdict: Verdict;
  reasonCode: string;
  explanation: string;
  evidenceIds: string[];
  expectedScope: Scope;
  observedScopes: Scope[];
  nextCheck: string;
  correction: string;
}
export interface Assessment {
  runId: string;
  counts: Record<Verdict, number>;
  coverage: 'partial' | 'bounded';
  findings: Finding[];
  manifest: InventoryItem[];
  gaps: CaptureGap[];
  sources: SourceHealth[];
  summary: string;
  requiredChecks: string[];
  limitation: string;
}
export interface RecoveryPlan {
  id: string;
  runId: string;
  originalDigest: string;
  findingId: string;
  mode: 'mock-checkpoint' | 'mock-fresh' | 'handoff';
  executable: boolean;
  checkpointId: string | null;
  restartBoundary: string;
  findingSeq: number;
  correction: string;
  effects: string[];
  limits: { maxEvents: number; timeoutMs: number; externalWrites: 0 };
  reason: string;
  createdAt: string;
}
export interface LensComparison {
  originalId: string;
  correctedId: string;
  linked: boolean;
  original: Record<Verdict, number>;
  corrected: Record<Verdict, number>;
  changes: { claim: string; before: Verdict | 'Absent'; after: Verdict | 'Absent' }[];
  scopeChanges: { field: string; before: string; after: string }[];
}
export interface LensSettings {
  consent: boolean;
  captureContent: boolean;
  liveCapture: boolean;
  externalAnalysis: boolean;
  retentionDays: number;
}
export interface LensArtifact {
  id: string;
  kind: 'correction' | 'handoff' | 'model-draft' | 'instruction-proposal' | 'review';
  title: string;
  text: string;
  createdAt: string;
}
export interface StoredRecording { recording: LensRecording; artifacts: LensArtifact[]; savedAt: string }
export interface RecordingListItem {
  id: string; name: string; status: string; startedAt: string; claims: number; unresolved: number; synthetic: boolean;
}
export interface WorkbenchState {
  settings: LensSettings;
  recordings: RecordingListItem[];
  selected: StoredRecording | null;
  assessment: Assessment | null;
  comparison: LensComparison | null;
  plan: RecoveryPlan | null;
  health: SourceHealth[];
  error: string | null;
  notice: string | null;
  busy: boolean;
}
export type WorkbenchAction =
  | { type: 'ready' | 'import' | 'privacy' | 'captureValidation' | 'importCollector' | 'existingChat' | 'purge' | 'modelReview' | 'instructionProposal' }
  | { type: 'example' | 'liveDemo'; scenarioId: ExampleId }
  | { type: 'export'; format: 'json' | 'markdown' }
  | { type: 'updatePrivacy'; settings: LensSettings }
  | { type: 'select' | 'compare'; runId: string }
  | { type: 'draftCorrection'; findingId: string }
  | { type: 'planRecovery'; findingId: string; checkpointId: string | null; fresh: boolean }
  | { type: 'executeRecovery'; planId: string }
  | { type: 'reviewFinding'; findingId: string; decision: 'acknowledged' | 'dismissed' };
