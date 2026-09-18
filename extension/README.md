# Agent Evidence Lens

**The work is done. Does the proof still apply?**

A desktop VS Code companion to Agent Flight Recorder. Follow a run, check whether its evidence still matches the final code and target, and leave a useful handoff.

## Get started

Install the locally generated `agent-evidence-lens-0.1.0.vsix` with **Extensions: Install from VSIX**. Open the Evidence Lens activity-bar icon, then **Open evidence workbench**. The normal editor and Chat remain untouched.

Try **The code changed after the test**. Allow local recording when prompted. Its earlier passing result does not establish whether the final code passes: the verdict is **Unverifiable**, not "broken."

Use **Review**, **Timeline**, **Manifest**, **Handoff**, **Compare**, **Recovery**, and **Privacy**. Paper/Graphite themes, accent colors, spacing, larger text, and reduced motion are available under **Make it yours**.

## What is real

- A separate bundled Node recorder process validates and normalizes versioned imports.
- Records and review artifacts use authenticated AES-256-GCM encryption. Their key is kept in VS Code SecretStorage, not a key file or the webview.
- Structured evidence checks bind positive test/action/health assertions and exact citation fidelity to explicitly linked results and the captured version/scope.
- The public Tasks API observes an explicitly selected, approved task. It fingerprints a bounded Git-visible file set before and after. It does not intercept terminal output or conclude that all tests passed from an exit code alone.
- Reviewed mock recovery restores only the compatible built-in synthetic harness state and creates a new linked run. It has no network, external writes, or live-tool fallback.
- Corrections, human reviews, Azure drafts, and scoped instruction proposals are separate from immutable original evidence. Workspace instruction changes require a diff, approval, and a base-state check.

## Optional local collector and live Azure

Start the repository's Node backend with `npm start`. It defaults to `http://127.0.0.1:4180`. The application-scoped setting `agentEvidenceLens.collectorUrl` can select another loopback port.

The backend, not this extension, reads the ignored local `.env` and holds the Azure API key. **Use live Azure** prepares an exact synthetic-evidence preview before approval. **Draft with Azure** previews the selected recording's minimized claim/scope metadata. Each call uses quota, has time/token/input limits, and requires approval; no scripted fallback disguises a cloud failure.

## Boundaries

No private Copilot panel capture, hidden reasoning, opaque MCP internals, or arbitrary CLI/Agency resume is available. These sources are visibly unavailable. A timeline position is not runtime state. Unsupported recovery becomes a reviewed fresh-run handoff.

Imports are explicit and content-minimized by default. External analysis and task capture are opt-in. Arbitrary free-form claims are not automatically interpreted or fact-checked; the positive assertion kind must match the intended meaning. Hashes detect inconsistency, not source authenticity.

The browser Lens is memory-only. The original recorder's SQLite database is separate and plaintext. Encryption protects this extension's vault, not those stores or reviewed plaintext exports. Lost SecretStorage keys cannot decrypt existing records; no replacement key is silently written over an existing vault.

Task execution and instruction edits require a trusted local workspace. Task execution is real user-selected code, not a sandbox. Task cancellation stops observation without automatically terminating the task.

The companion runs in the **local desktop UI extension host**, even when a remote window is open. Its vault and loopback collector do not move into an SSH, WSL, container, or Codespaces host. Remote/virtual workspace task capture and instruction edits are unsupported; open the local Git folder for those features.

This is a locally packaged prototype, not a Marketplace publication. No open-source license has been selected for this project; bundled dependency notices are included.
