# Security and data handling

This is a single-user, loopback-only prototype, not a public multi-tenant service.

- Do not expose its HTTP or MCP endpoints directly to the internet.
- The client header is a browser-CSRF boundary, not user authentication.
- Per-run write tokens are credentials; keep them out of source, logs, issues, and screenshots.
- Reviewer labels are not authenticated identities.
- Record only data you are authorized to retain. Credential-pattern redaction is best effort, not complete DLP.
- The original SQLite data and exported recordings are not encrypted. The VS Code Evidence Lens vault is separate and uses authenticated AES-256-GCM envelopes with SecretStorage-managed keys; it does not silently encrypt/migrate the legacy store.
- Hash chains check consistency; they are not authenticated signatures.
- The sandbox policy engine governs only the included demo runner.
- The browser Lens retains recordings only in memory. Only non-sensitive display preferences use browser localStorage.
- Keep the Azure API key only in the ignored server `.env` or an equivalent process environment. Never use `VITE_*`, embed credentials in browser bundles, or put keys in recordings. Rotate keys disclosed in chat or other unintended channels.
- Azure review is opt-in, bounded and previewed per request. It sends minimized claim/scope metadata to the explicitly configured resource; that can still contain sensitive identities. `store:false` is not a promise that the provider has no service-side retention.
- Model output and imported evidence are untrusted data. Model prose never changes deterministic verdicts or executes instructions/tools.
- Exact-point recovery is limited to the known mock harness. Imported code is never executed, mocks have no live fallback, and external runtimes without a compatible adapter get handoffs.
- Selected VS Code task execution is real user-approved workspace code, not a sandbox. No private terminal/Chat capture is performed. Task observation cancellation does not automatically terminate the task.
- Scoped instruction proposals require a reviewed diff and explicit approval. They must not overwrite concurrent edits or follow a linked target.
- Loss of the vault key prevents decryption. The application refuses to replace a missing key over existing encrypted records. Back up the appropriate VS Code profile/SecretStorage and vault securely.

## Reporting a problem

Do not file a public issue containing credentials, real recordings, private prompts, or exploit details.

If the repository's Security tab offers private vulnerability reporting, use that channel. Otherwise contact the repository owner privately to agree on a safe reporting channel before sharing sensitive details. No private reporting feature or response-time commitment is implied by this file.

Include the affected revision, a description of the impact, and a minimal reproduction using synthetic data. Follow `docs\ARCHITECTURE.md` for the intended trust and execution boundaries.
