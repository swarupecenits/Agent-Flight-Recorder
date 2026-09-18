# Agent Evidence Lens

The companion implements the revised brief's central question: **does the captured proof still apply to the delivered code and target?**

The browser and VS Code share the same React workbench and deterministic evidence engine. The browser is a memory-only preview. The desktop extension adds the encrypted vault, public task capture, reviewed workspace instruction edits, and editor-integrated previews.

## Brief-to-feature map

| Requirement | Implemented behavior |
| --- | --- |
| Version-bound evidence | A passed result for version A cannot support the final version B. Missing versions, unsaved buffers, or changes during a selected task produce an explicit unresolved finding. |
| Exact target and scope | Resource, environment, and query-scope mismatches remain Unverifiable. A denied query does not prove unhealthy infrastructure. |
| Four verdicts | Supported, Contradicted, Unsupported, and Unverifiable, with the exact claim, reason, applicable result, source IDs, and next check. |
| Timeline and evidence detail | Read-only stepping, playback, seeking, speed, pause-at-concern, causal parents, checkpoint boundary, scope, and optional content. |
| Run Manifest | Agents, tools, skills, instructions, repositories, resources, and MCP inventory when explicitly supplied. Available and actually used are separate; versions and gaps stay visible. |
| Evidence-linked handoff | Supported conclusions, unresolved claims, required checks, capture gaps, and navigable references to the included source steps. |
| Reviewed correction | A previewed draft saved as a separate review artifact; the original claim and deterministic verdict remain unchanged. |
| Reviewed recovery | Concern -> compatible earlier mock checkpoint or explicit fresh run -> effect/limit review -> approval -> new parent-linked run -> comparison. |
| Unsupported runtime | A handoff, not invented exact resume. Private Copilot panels, hidden reasoning, uninstalled CLI/Agency checkpoint adapters, and opaque MCP internals remain unavailable. |
| Local-first architecture | Public/versioned adapters and a separate bundled recorder worker; strict IPC/schema validation; minimized imports and explicit source-health reporting. |
| Encryption | AES-256-GCM with random 96-bit nonces and full 128-bit tags; authenticated record IDs; atomic encrypted writes. Keys are held by VS Code SecretStorage. |
| Source/privacy choices | Local consent, optional imported content, selected-task capture, reviewed external analysis, 1-365 day retention with explicit deletion, and reviewed plaintext exports. |
| Reviewed learning proposal | A known `.github\instructions\evidence-lens.instructions.md` target, displayed diff, workspace scope, explicit approval, base-state/concurrent-edit checks, and a separate audit artifact. Nothing is learned silently. |
| Live Azure | Real streaming Responses calls from the local backend. Exact metadata preview, per-request approval, measured tokens/deltas/duration, separate advisory draft, no invented success fallback. |
| Accessible customization | Paper/Graphite/device themes, three accents, spacing, text size, detail level, reduced motion, keyboard navigation and responsive layout. |

## Verdict contract

This is deliberately not a general-purpose semantic fact checker. The source must declare a **positive assertion kind** and explicitly link supporting observations:

- `test`: the declared test validation passed.
- `action`: the declared action completed successfully.
- `health`: the declared target is healthy.
- `citation`: the supplied exact quotation occurs in the captured source version.

The free-form `text` is the displayed wording. It must accurately express that declared kind. Do not submit arbitrary negative claims, broader conclusions, or an "all tests" claim backed only by an opaque task exit. The engine does not silently infer these semantics or let an LLM decide the authoritative verdict.

Evidence must precede the claim, have the compatible observation kind, and match the required scope/version. The most recent applicable **explicitly referenced** observation is used. Relevant event-linked capture gaps invalidate support. A scope mismatch says "not proven for this target," not "this target is broken."

## Formats

`lens\types.ts` defines Evidence Lens v1; `lens\schema.ts` enforces it, bounds recordings to 1,000 events and 6 MiB, and verifies ordered event IDs, causal parents, and the canonical digest.

Imports support:

- `agent-evidence-lens`, version `1`.
- `agent-flight-recorder`, version `1`, using the original native schema, hash-chain checks, and lifecycle validation.

Native captures can supply:

```javascript
metadata: {
  evidenceLens: {
    version: 1,
    finalScope: { repositoryId: 'demo:repo', codeVersion: 'final-version', suite: 'unit' },
    inventory: []
  }
}
```

Annotate an explicitly observed result using a regular SDK event:

```javascript
const resultEvent = await run.event('decision', 'Observed unit result', {
  attributes: {
    lens: {
      version: 1,
      scope: observedScope,
      observation: { kind: 'test', outcome: 'passed', exitCode: 0, passed: 3, failed: 0 },
      assetIds: ['unit-harness']
    }
  }
});
```

Use actual measured results; the numeric values above illustrate the schema, not a replacement for executing tests. A later claim links `resultEvent.id`. `contextSnapshot: true` with a new scope records the final context. Run `npm run demo:evidence` for two complete, actually executed SDK examples.

Native data without these annotations remains inspectable, but missing claims, versions, inventories, or runtime state are not inferred from names.

Redaction/minimization produces a clearly marked derivative with its own digest and retained source-digest provenance. Original history is never overwritten. An identical ID with different content is rejected; create a new recording for a materially different capture.

## Selected-task capture

The extension uses public `vscode.tasks` events and the explicitly selected execution identity. Its adapter generates a narrow candidate task-completion check, not an intercepted agent answer, private terminal output, or test count.

The manifest requires the local desktop UI extension host, and activation refuses a workspace-host override. Vault files and loopback collector requests therefore stay on that desktop. Remote/virtual folders are not eligible for task capture or workspace instruction edits.

The version boundary is the selected Git repository root's tracked and nonignored untracked file set. Ignored files, credential paths, runtime resources, and external dependencies are outside that boundary. Source bytes are hashed, not stored. Read-only Git queries omit ambient per-command credential/repository overrides so unrelated launcher settings cannot redirect the selected repository.

Bounds are 4,000 files, 2 MiB per file, and 32 MiB total. Symlinks, inaccessible/oversized/changing files, incomplete Git inventory, and dirty editor buffers prevent claiming a complete code version. Known workspace instruction files are listed as available, not falsely marked as read by an agent.

The selected task is **real workspace code, not a sandbox**. Review its command. Cancelling or reaching the 10-minute observation limit stops observation, not necessarily the task. No arbitrary terminal transcript or unrelated task is persisted.

## Storage boundaries

| Store | Protection |
| --- | --- |
| VS Code Lens vault | Encrypted individual records and separate review artifacts under the extension's profile-scoped global storage. SecretStorage holds the key. |
| Browser Lens | Memory only; lost on refresh/close. Display preferences alone use localStorage. |
| Original recorder | Existing plaintext SQLite in `data`; not silently migrated or advertised as encrypted. |
| Local `.env` | Git-ignored server configuration. The Azure key is never sent to the browser or extension. Protect this file with local filesystem controls. |
| Reviewed exports | Explicitly plaintext. Inspect them before sharing. |
| Azure review | Only the approved bounded metadata is transmitted to the configured endpoint; `store:false` is requested, but provider service policies still apply. |

Vault limits: 200 recordings, 100 review artifacts per recording, 32,000 characters per artifact, and 12 MiB per encrypted envelope. Capacity/corruption/key-loss failures are explicit. A missing SecretStorage key over existing ciphertext is an error, never a new-key/plaintext fallback.

## Recovery boundaries

The built-in mock harness can restore only its recognized `addition-v1` fixture state, revision, environment, and state hash. A checkpoint must precede the relevant result, not merely the later finding.

Recovery is bounded to 30 events, 5 seconds of in-memory work, and zero external writes. It never evaluates imported code, invokes arbitrary tools, runs a shell, or falls back to a live tool. Each retry is a new recording; duplicate approval IDs return the same created run.

External captures with no compatible runtime adapter can generate a reviewed handoff. They cannot be exactly resumed by the prototype. The selected-task adapter does not supply task-runtime checkpoints.

## Azure boundaries

`server\foundry.mjs` owns the API key and Responses client. `server\lens.mjs` prepares exact request previews and records the resulting measured model metadata. The returned text is an advisory artifact, never the evidence engine's source of truth.

Limits: one active request, 24,000 input bytes, 1,800 output tokens, a 90-second abort deadline, no automatic SDK retries, no redirects to another host, and 32 requests/previews per backend session. Request IDs are bound to their reviewed operation, so conflicting reuse is rejected. Restart the backend deliberately if you reach the session cap.

The existing five report-agent scenarios remain explicitly scripted local fixtures. Live Azure review does not claim that fictional tools now access production infrastructure or send real email.
