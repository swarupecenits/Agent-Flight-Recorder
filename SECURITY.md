# Security and data handling

This is a single-user, loopback-only prototype, not a public multi-tenant service.

- Do not expose its HTTP or MCP endpoints directly to the internet.
- The client header is a browser-CSRF boundary, not user authentication.
- Per-run write tokens are credentials; keep them out of source, logs, issues, and screenshots.
- Reviewer labels are not authenticated identities.
- Record only data you are authorized to retain. Credential-pattern redaction is best effort, not complete DLP.
- SQLite data and exported recordings are not encrypted by this application.
- Hash chains check consistency; they are not authenticated signatures.
- The sandbox policy engine governs only the included demo runner.

## Reporting a problem

Do not file a public issue containing credentials, real recordings, private prompts, or exploit details.

If the repository's Security tab offers private vulnerability reporting, use that channel. Otherwise contact the repository owner privately to agree on a safe reporting channel before sharing sensitive details. No private reporting feature or response-time commitment is implied by this file.

Include the affected revision, a description of the impact, and a minimal reproduction using synthetic data. Follow `docs\ARCHITECTURE.md` for the intended trust and execution boundaries.
