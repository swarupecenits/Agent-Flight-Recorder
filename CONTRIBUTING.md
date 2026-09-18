# Contributing

## Local setup

Use Node.js 24 and npm 11 or later. From the repository root:

```text
npm ci
npm run dev
```

Open `http://127.0.0.1:5180`. The API uses port 4180. Stop an existing production instance before starting development mode.

The committed `.npmrc` contains only a portable lockfile option. Keep authentication, registry credentials, and network-specific settings in your user configuration; never add them to this repository.

## Before proposing a change

```text
npm run check
npm run browser:install
npm run test:e2e
```

The browser installation is needed once per Playwright/browser revision. On Linux hosts missing browser system packages, use `npm run browser:install:ci`. `AFR_BROWSER` may instead point to an existing Chromium-based browser executable.

The Node suite uses isolated workspaces. Browser tests use an in-memory database and write their own outputs to ignored `test-results` and `playwright-report` directories. They do not depend on local demonstration artifacts.

## Project conventions

- Keep the HTTP contract and UI types in `shared\contracts.ts` consistent.
- Validate input at the collector and return explicit errors.
- Capture observable events and explicit annotations, not hidden model reasoning.
- Replay must reconstruct recorded state without executing tools or resolving approvals.
- Preserve the distinction between replay and a new sandbox rerun.
- Keep the included fixtures fictional and outbound delivery local-only.
- Add focused regression coverage and update the relevant documentation.
- Preserve `package-lock.json` and the registry-independent lockfile setting when updating dependencies.

## Files that do not belong in commits

Do not commit local SQLite workspaces, captured prompts/results, exports, screenshots containing private data, browser traces, `.env` files, credentials, dependency folders, or generated builds. These are excluded by `.gitignore`; do not use `git add -f` to bypass those exclusions.

Use the checked-in synthetic fixtures and demo preparation script to reproduce behavior. Reports should describe the issue without including real user or company data.

## Repository automation

GitHub Actions builds and runs the Node suite on Windows and Linux, then runs isolated Chromium workflows on Linux. It requires no cloud credentials or deployment secrets and does not publish packages or deploy the application.

No open-source license has been selected for this project. Do not add or change a license without the repository owner's approval.
