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

Avoid secrets and personal information. Redaction is best effort. The local database and exports are not encrypted by this application.
