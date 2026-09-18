import type {
  Approval,
  Comparison,
  Delivery,
  Overview,
  Policy,
  ReplayResult,
  Run,
  RunDetail,
  RunStatus,
  Scenario,
} from '../../shared/contracts.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions extends RequestInit {
  json?: unknown;
}

function isMutationMethod(method: string | undefined): method is MutationMethod {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method ?? 'GET').toUpperCase());
}

async function readError(response: Response): Promise<ApiError> {
  const fallbackCode = `HTTP_${response.status}`;
  const fallbackMessage = `Request failed with status ${response.status}.`;
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      response.status,
      payload.error?.code ?? fallbackCode,
      payload.error?.message ?? fallbackMessage,
    );
  } catch {
    return new ApiError(response.status, fallbackCode, fallbackMessage);
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (isMutationMethod(method)) {
    headers.set('X-AFR-Client', 'ui');
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    body: options.json === undefined ? options.body : JSON.stringify(options.json),
  });

  if (!response.ok) {
    throw await readError(response);
  }

  if (response.status === 204) {
    throw new ApiError(204, 'EMPTY_JSON_RESPONSE', 'The collector returned no data for an endpoint that requires a JSON response.');
  }

  return (await response.json()) as T;
}

export const api = {
  getOverview(signal?: AbortSignal) {
    return request<Overview>('/overview', { signal });
  },
  getRuns(params: { q?: string; status?: RunStatus | '' }, signal?: AbortSignal) {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.status) search.set('status', params.status);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return request<{ runs: Run[] }>(`/runs${suffix}`, { signal });
  },
  getScenarios(signal?: AbortSignal) {
    return request<{ scenarios: Scenario[] }>('/scenarios', { signal });
  },
  createDemo(scenarioId: Scenario['id'], name?: string) {
    return request<{ runId: string }>('/demos', { method: 'POST', json: { scenarioId, ...(name ? { name } : {}) } });
  },
  getRunDetail(runId: string, signal?: AbortSignal) {
    return request<RunDetail>(`/runs/${encodeURIComponent(runId)}`, { signal });
  },
  getReplay(runId: string, cursor: number, signal?: AbortSignal) {
    return request<ReplayResult>(`/runs/${encodeURIComponent(runId)}/replay?cursor=${cursor}`, { signal });
  },
  resolveApproval(
    approvalId: string,
    decision: 'approve' | 'reject',
    actor: string,
    comment?: string,
  ) {
    return request<{ runId: string }>(`/approvals/${encodeURIComponent(approvalId)}/resolve`, {
      method: 'POST',
      json: { decision, actor, ...(comment ? { comment } : {}) },
    });
  },
  importRecording(recording: unknown) {
    return request<{ runId: string; duplicate: boolean }>('/import', {
      method: 'POST',
      json: { recording },
    });
  },
  forkRun(runId: string, scenarioId: Scenario['id']) {
    return request<{ runId: string }>(`/runs/${encodeURIComponent(runId)}/fork`, {
      method: 'POST',
      json: { scenarioId },
    });
  },
  getComparison(runId: string, otherRunId: string, signal?: AbortSignal) {
    return request<Comparison>(`/runs/${encodeURIComponent(runId)}/compare/${encodeURIComponent(otherRunId)}`, { signal });
  },
  getPolicies(signal?: AbortSignal) {
    return request<{ policies: Policy[] }>('/policies', { signal });
  },
  getOutbox(signal?: AbortSignal) {
    return request<{ deliveries: Delivery[] }>('/outbox', { signal });
  },
  getHealth(signal?: AbortSignal) {
    return request<{
      status: 'ok';
      name: string;
      version: string;
      modelMode: 'scripted-demo';
      mcpPath: '/mcp';
      collectorUrl: string;
      persistent?: boolean;
    }>('/health', { signal });
  },
};

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred.';
}

export type ApprovalResolution = Approval['status'];
