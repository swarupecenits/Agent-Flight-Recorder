# Project scope

Project: **Agent Flight Recorder**

The project is a black-box recorder for agents: capture observable execution, replay it chronologically, debug errors, explain policy outcomes, and derive performance insights. This document maps that scope to the implemented prototype without requiring access to an internal submission portal.

| Project requirement | Working prototype surface |
| --- | --- |
| Capture prompts and decisions | SDK prompt and explicit annotation events; timeline payloads and state deltas. |
| Capture tool calls and results | Real `FileSearchTool`, `ReadFileTool`, and `SendEmailTool` callbacks, plus wrappers for your own functions. |
| Capture outputs, errors, retries | Attempt-level start/end/error spans, retry events, final output, persistent failure and recovery scenarios. |
| Replay and debug step by step | Safe event stepping, seeking, playback, error/policy breakpoints, and state reconstruction. |
| Show allowed, blocked, and approval-required actions | Rule ID, outcome, reason, exact requested action, explicit reviewer decision, and resulting execution events. |
| Identify failures and performance patterns | Derived error/retry findings, blocked actions, pending approvals, incomplete spans, and measured operation durations. |
| Microsoft Foundry / MCP direction | Working read-only MCP tools, framework-neutral capture, and OTLP/JSON export. No cloud deployment or live Foundry connection is implied. |
| Search/read/report/send with approval | An instrumented fictional sales-report agent implements this sequence. Sending is a local outbox receipt, never an actual external email. |

Additional prototype affordances include persistent SQLite storage, immutable JSON imports, chain-consistency checks, native/Markdown/OTLP exports, and linked what-if runs with comparisons.
