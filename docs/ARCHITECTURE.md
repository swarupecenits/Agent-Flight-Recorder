# Architecture

```text
React workbench ---- HTTP API ---- SQLite recordings / approvals / outbox
                          ^
                          |
Independent Node SDK -----+       Native JSON import / export
Python HTTP example ------+       Markdown report / OTLP projection
                          |
Local demo runner -> Node capture SDK -> in-process validated store
       |
       +-> fixed catalog search -> allowlisted fixture read -> scripted formatter
       +-> policy check -> explicit human approval where required -> LOCAL outbox

MCP clients ---- stateless read-only tools ---- recordings / replay / comparison
```

## Capture model

Each run has an immutable header: run ID, trace ID, name, agent, input, metadata, origin, creation time, and optional parent/scenario IDs. A SHA-256 digest of that header anchors a chain of canonical event envelopes.

Each accepted event has a unique ID within its run, an atomically assigned sequence, client timestamp, collector timestamp, typed input/output/error, span/parent span IDs, optional measured duration, annotations, state changes, redaction paths, previous hash, and its own hash.

SQLite transactions make batches all-or-nothing. A matching explicit event ID and identical payload is idempotent; a changed payload is a conflict. A terminal event closes the recording. Final output and termination have reserved capacity.

Capture writers need their run's confidential write token. Only its hash is stored. UI reads, MCP reads, and exports never expose that token.

## Observation versus execution

`shared\trace.mjs` is a pure replay reducer: it folds the prefix ending at the selected sequence into context, messages, tool results, failures, policy state, and output. The replay route and MCP replay tool have no reference to the executor.

What-if is separate: the fork endpoint creates a new actual sandbox run and retains a parent link. It does not alter the original. Imported or arbitrary SDK code cannot be executed by that endpoint.

Explicit decision annotations are not hidden model reasoning. Observed tool outputs are not proof of unrecorded reasoning or activity outside instrumentation.

## Policy and approval boundary

The local runner uses a fixed allowlisted catalog and fixed tool functions. Restricted report reads are denied before the callback. External-recipient sandbox messages require approval.

The pending approval stores the exact input. Resolution atomically claims the request, records a decision, and rotates the internal capture token for continuation. Sending rechecks the persisted approved input and policy. A unique delivery per run prevents duplicate receipts.

All delivery is local SQLite data. There is no network sender, arbitrary command execution, or user-supplied filesystem path.

External SDK agents retain their own execution and policy authority; the recorder does not become an enterprise policy enforcement service simply because instrumentation is enabled.

## Persistence and recovery

The default workspace is `data\flight-recorder.sqlite`. WAL is enabled. Cooperating recorder processes use a database ownership record so a second instance cannot reopen a live workspace and interrupt its runs.

On restart, a previously running execution is marked `interrupted`, with an explicit recovery event. Unfinished tool outcomes are unknown; their side effects are never automatically repeated.

Pending sandbox approvals remain pending and can be explicitly resolved after restart because the exact message is stored. Imported pending recordings remain read-only snapshots and do not create actionable approval requests.

## Formats and interoperability

- Native version-1 JSON preserves the immutable header and complete ordered event chain.
- Import validates IDs, lifecycle, sequence, hashes, sizes, supported event types, and known credential patterns. It never overwrites a conflicting run. Identical existing recordings are reopened.
- Markdown includes metrics, findings, the timeline, local receipts, and full recorded payloads.
- OTLP/JSON exports a root execution span plus model/tool spans, with recorded events and attributes. IDs use hexadecimal strings and 64-bit timestamps use decimal strings. Timestamps originate at millisecond resolution; the export does not claim nanosecond measurement precision.
- When a recorded end timestamp precedes its start because of clock skew, the OTLP projection clamps that span's exported duration to zero and attaches the original end timestamp and an explicit skew annotation. Native recordings are unchanged.
- MCP uses the official TypeScript SDK v2 packages and stateless Streamable HTTP JSON responses. It exposes only five read tools. Recorded content is explicitly labeled untrusted data.

OTLP format reference: `https://opentelemetry.io/docs/specs/otlp/`

MCP SDK reference: `https://github.com/modelcontextprotocol/typescript-sdk`

## Security and operational limits

The server binds only to loopback, checks Host/Origin, rejects form-like mutation requests, requires a client header on mutation APIs, validates JSON shapes, restricts body size, and serves only built frontend assets. These are local prototype boundaries, not multi-user authentication.

Data uses ordinary filesystem persistence, not application-level encryption. Reviewer names are local labels. Redaction is best effort. Hashes are unkeyed consistency checks, not authenticated provenance. Do not expose this development collector publicly without a separate authenticated, encrypted, multi-tenant deployment design.

The application never uploads source code, recordings, reports, or credentials to a cloud service on its own.
