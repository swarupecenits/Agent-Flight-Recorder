# Local API

Base address: `http://127.0.0.1:4180`

Mutating API requests require `Content-Type: application/json` and `X-AFR-Client: ui` or `sdk`. Browser requests must come from the allowed loopback origin. The client header is not authentication. Capture mutations also require the private per-run `X-AFR-Write-Token`.

Error responses use a non-2xx HTTP status and:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Readable details"}}
```

## Read endpoints

| Method and path | Response |
| --- | --- |
| `GET /api/health` | Health, app name/version, scripted-demo mode and MCP path |
| `GET /api/overview` | Actual workspace totals, runs, recent-run findings, fixed policies |
| `GET /api/runs?q=&status=` | `{ "runs": [...] }`; search name, agent, scenario, run ID or trace ID |
| `GET /api/runs/:id` | Run, ordered events, approvals, insights, tool metrics, integrity and local deliveries |
| `GET /api/runs/:id/replay?cursor=N` | State through event N; N=0 means the empty initial state |
| `GET /api/runs/:id/compare/:otherId` | Both runs, right-minus-left metric deltas, outcome/tool/policy/output differences |
| `GET /api/scenarios` | The five executable local scenarios |
| `GET /api/policies` | Fixed local policy definitions |
| `GET /api/outbox` | Local sandbox receipts; these are not sent messages |
| `GET /api/runs/:id/export?format=json` | Native version-1 recording download |
| `GET /api/runs/:id/export?format=markdown` | Full Markdown investigation report |
| `GET /api/runs/:id/export?format=otlp` | OTLP/JSON export projection |

All replay responses include `sideEffectsExecuted: 0`. Reads do not mutate approvals or execute agents.

## Capture an independent agent

### Start

`POST /api/capture/runs`

```json
{
  "name": "My report agent run",
  "agentName": "custom-agent",
  "input": {"prompt": "Find the report"},
  "metadata": {"environment": "local"}
}
```

Returns HTTP 201:

```json
{
  "runId": "<uuid>",
  "traceId": "<32 hexadecimal characters>",
  "writeToken": "<confidential capture credential>"
}
```

Keep the write token private. It is not included in read/export results.

### Append

`POST /api/capture/runs/:id/events`, with `X-AFR-Write-Token`.

```json
{
  "events": [
    {
      "type": "decision",
      "name": "Select the report returned by search",
      "stateDelta": {"selectedReport": "fictional-q2"}
    }
  ]
}
```

An atomic batch contains 1-50 events. Optional fields:

| Field | Meaning |
| --- | --- |
| `id` | Client-generated UUID for idempotency; omit to generate one |
| `timestamp` | ISO timestamp with timezone; collector timestamp is also retained |
| `spanId`, `parentSpanId` | 16-character hexadecimal identifiers or null |
| `input`, `output` | Plain JSON |
| `error` | `{name, message, code?}`; error messages are limited to 4,000 characters |
| `durationMs` | Non-negative measured callback milliseconds |
| `attributes` | Named JSON metadata |
| `stateDelta` | Named shallow changes to recorded replay context |
| `redactedPaths` | Redaction annotations carried from a client-side redactor |

Supported client event types:

```text
prompt, decision, tool.started, tool.completed, tool.failed,
model.started, model.completed, model.failed, retry, policy.evaluated,
approval.requested, approval.resolved, output
```

Lifecycle events (`run.started`, `run.completed`, `run.failed`, `run.blocked`, `run.interrupted`) are collector-managed; clients use start/finish routes.

For measured model usage, use `attributes.usage: {"inputTokens":11,"outputTokens":2}` on `model.completed`. Omit usage when it was not measured. Do not substitute guesses.

Append responds with `{ "events": [<accepted envelopes>] }`, including sequence, server timestamp and hashes. Repeating the same explicit ID and payload is idempotent. Reusing an ID for a changed payload returns HTTP 409.

### Finish

`POST /api/capture/runs/:id/finish`, with `X-AFR-Write-Token`.

```json
{"status":"completed","output":{"summary":"Finished"}}
```

For a failure:

```json
{"status":"failed","error":{"name":"ReadError","message":"The report could not be read"}}
```

Status can be `completed`, `failed`, `blocked`, or `interrupted`. The output and lifecycle events are committed atomically, and the closed recording rejects further new events.

## Sandbox execution endpoints

| Endpoint | Body | Meaning |
| --- | --- | --- |
| `POST /api/demos` | `{"scenarioId":"approval"}`; optional name | Execute a new real local demo |
| `POST /api/runs/:id/fork` | `{"scenarioId":"success"}` | Execute a NEW demo with a parent link |
| `POST /api/approvals/:id/resolve` | `{"decision":"approve","actor":"Local reviewer","comment":"Reviewed"}` | Explicitly approve or reject the exact sandbox action |

Scenario IDs are `approval`, `retry`, `blocked`, `failure`, and `success`. Run creation returns `{ "runId": "..." }`; poll the detail route for subsequent events.

An approved local action creates a SQLite receipt, not an email. Only demo runs can fork. Native imports do not create executable approvals. Capturing an external agent's approval event is an observation; it does not register that agent's arbitrary code for execution.

## Import

`POST /api/import` with `{"recording": <native JSON export>}`.

Only the native `agent-flight-recorder`, version 1 format is accepted. Hashes, lifecycle, event sequence and sizes must agree. Credential-pattern changes are rejected rather than silently rewriting an already-hashed recording.

Returns `{ "runId": "...", "duplicate": false }`. A byte-equivalent canonical recording already in the workspace returns `duplicate: true` and is reopened; a conflicting version is not overwritten.

Imported records have `origin: "import"` and `readOnly: true`. Partial source captures remain immutable snapshots. Their recorded pending approvals are inspectable events, not live executable approval requests.

## Evidence Lens

Lens routes use the same loopback/origin and JSON mutation boundaries as the recorder. They return an immutable `agent-evidence-lens` v1 recording and/or a deterministic assessment; they do not add it to the original SQLite store. Browser records remain in memory. The VS Code controller explicitly saves approved records and separate review artifacts in its encrypted vault.

| Endpoint | Body / response |
| --- | --- |
| `GET /api/lens/status` | Safe provider configuration, adapter availability, example scenarios and persistence boundaries. No API key is returned. |
| `GET /api/runs/:id/evidence` | Verified, minimized derivative of an existing native run; `{recording, assessment}`. |
| `POST /api/lens/analyze` | `{recording, captureContent?: false}`; accepts native AFR v1 or Lens v1 and returns `{recording, assessment}`. |
| `POST /api/lens/example` | `{scenarioId}`; creates one labeled synthetic example and returns `{recording, assessment}`. |
| `POST /api/lens/live-demo/prepare` | `{scenarioId}`; returns `{prepareId, context, endpoint}` without making a model request. |
| `POST /api/lens/live-demo` | `{scenarioId, prepareId, consent: true, requestId}`; HTTP 201 with `{recording, assessment, draft}` after a real Azure request. |
| `POST /api/lens/model-context` | `{recording, captureContent?: false}`; exact minimized model projection and destination, without calling the model. |
| `POST /api/lens/model-review` | `{recording, consent: true, requestId}`; returns the advisory draft and actual model/usage metadata, not a new verdict. |
| `POST /api/lens/compare` | `{original, corrected}`; returns the evidence comparison, including unresolved and changed findings. |
| `POST /api/lens/recovery/plan` | `{recording, findingId, checkpointId: string \| null, fresh: boolean}`; returns a reviewable plan with its actual restart boundary, effects and limits. |
| `POST /api/lens/recovery/execute` | `{planId, approved: true}`; returns `{recording, assessment, comparison}` for an executable fixed mock plan. |

Lens scenario IDs are `stale`, `contradiction`, `scope`, `denied`, and `corrected`. `requestId`, `prepareId`, and `planId` are UUIDs. `findingId` and checkpoint IDs come from the returned assessment/recording; do not invent them.

### Reviewed external analysis

1. Prepare the chosen synthetic example, or request model context for an already selected recording.
2. Show the exact returned `context` and `endpoint` to the user. Metadata can contain repository/resource identities even when raw content is excluded.
3. Only after approval, submit the same prepared example or unchanged recording, a fresh request ID, and `consent: true`.
4. Keep the returned draft separate from the immutable recording and computed verdicts.

The browser and VS Code flows use `prepareId` to bind a live-demo approval to the exact cached recording. The direct API also accepts an omitted `prepareId` for an explicitly consented synthetic command-line demonstration; that mode is not an exact-preview UI flow.

Repeated use of the same request ID and operation returns its original promise/result without a second model call. Reusing it for different content or a different operation returns `REQUEST_ID_CONFLICT` (409). A failed request stays failed for that ID. Deliberate retries need new approval and a new ID.

Model calls use server-side configuration, one active request, a 24,000-byte projection limit, a 90-second timeout, and at most 1,800 output tokens. There are no automatic SDK retries or fake-success fallbacks. Requests set `store: false`; this is not a claim that all provider-side service logging is disabled. Raw source, input/output bodies, excerpts and review artifacts are excluded from the projection. User-visible model errors are sanitized.

Each backend process retains at most 32 prepared previews, 32 model-operation IDs and 100 recovery plans. Restarting resets those in-memory caches, not the SQLite recordings. A stale preview/plan must be prepared and reviewed again.

### Recovery, integrity and content

Executable recovery is limited to a compatible checkpoint or explicitly fresh run of the fixed, in-memory mock adapter. Other runtimes return a handoff-only plan; execution returns `HANDOFF_ONLY` (409), never an automatic live fallback. Duplicate approval of an executable plan returns its existing child run. The original is unchanged.

Malformed, modified, incompatible or causally invalid imports return `INVALID_EVIDENCE_RECORDING` (422). Native imports first verify the original AFR schema, hash chain and lifecycle. Redaction/minimization then creates a derivative with its own digest and retained source-hash provenance; a digest is an integrity check, not a signature.

`captureContent` defaults to false. Exact quote checks become Unverifiable without the supplied quote/excerpt; the engine does not reconstruct omitted content. Annotations use `metadata.evidenceLens` and `attributes.lens` v1, described in `sdk\README.md` and `docs\EVIDENCE-LENS.md`. A tool returning successfully without an explicitly compatible linked observation cannot establish a broader claim.

## MCP

Endpoint: `POST /mcp`, Streamable HTTP with JSON responses. Use `Accept: application/json, text/event-stream`.

| Tool | Inputs |
| --- | --- |
| `list_runs` | `limit` (1-50, default 20), optional `query` |
| `get_trace` | `runId`, `afterSeq` (default 0), `limit` (1-50, default 20) |
| `replay_state` | `runId`, `cursor` |
| `find_failures` | `runId` |
| `compare_runs` | `leftRunId`, `rightRunId` |

All tools are read-only. `get_trace` supports pagination using `nextAfterSeq` and `hasMore`. Tool responses mark the contents as untrusted recorded data, not instructions. There are no MCP tools for approval, mutation, or rerun.

## Capacity and privacy

One local workspace supports 500 runs, 1,000 events per run, 64 KiB per event, and 4 MiB of canonical event data per run. Two event slots and 128 KiB are reserved for final output and termination. The HTTP body limit is 6 MiB; the UI accepts native recording files up to 5 MiB.

Collector arrival order defines sequence. Client clocks may differ from collector clocks. Callback durations and run wall times measure different things, especially when waiting for human approval.

Avoid secrets and personal information. Redaction is best effort. The original recorder database and approved exports are plaintext. Only the separate VS Code Lens vault encrypts its stored recordings and artifacts; it does not encrypt or replace the original SQLite database.
