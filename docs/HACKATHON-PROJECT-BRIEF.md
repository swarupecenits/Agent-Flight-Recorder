# Agent Flight Recorder + Evidence Lens

**Quick hackathon briefing**

> A flight recorder for AI agents: capture what happened, replay it safely, and check whether the evidence actually supports the result being handed over.

## 1. Problem, use case, and value

An agent saying "done" is not proof. A passing test may belong to old code, a health check may target staging instead of production, or an action may still need approval.

**Flight Recorder answers "What happened?" Evidence Lens answers "Does the proof still apply?"**

**Users:** developers debugging agents, reviewers checking completion claims, and on-call engineers preparing handoffs. The value is connecting an answer to its actual supporting steps and missing checks.

**Main story:** Maya's agent tests version A, delivers B, and claims success. Lens reports **Unverifiable**, not "broken." Approved demo recovery performs fresh validation; a new linked recording becomes Supported while the original stays unchanged.

## 2. What we implemented

| Area | Working capability |
| --- | --- |
| Execution recording | Prompts, explicit decisions, model/tool calls, inputs/outputs, errors, retries, timings, state changes, and approvals. |
| Replay and diagnostics | Step/seek/playback, speed, filters, breakpoints, reconstructed state, and findings for failures, retries, slow operations, and approval waits. |
| Policies and human review | Local allow/block/review rules, exact-action approval/rejection, and duplicate-receipt prevention. |
| Evidence Lens | Deterministic checks of declared test, action, health, and exact-quotation claims against linked results, versions, and targets. |
| Manifest and handoff | Available versus actually used assets; visible versions/gaps; source-linked summaries and next checks. Corrections are separate review notes. |
| Recovery and comparison | Reviewed mock checkpoint/fresh run, bounded effects, preserved originals, parent linkage, and before/after comparison. |
| VS Code companion | Chosen-task capture and file fingerprints, encrypted storage, reviewed workspace rules, privacy choices, exports, and retention. |
| Optional live Azure | Real Responses streaming, demonstrated with `gpt-5.4`; approved metadata previews, measured tokens/duration, and advisory handoff drafts. |
| Integrations | Node capture SDK, Python/HTTP example, five read-only MCP tools, validated native JSON import, and JSON/Markdown/OTLP trace export. |
| Interface | Paper/Graphite/device themes, three accents, spacing, larger text, adjustable technical detail, reduced motion, keyboard navigation, and responsive layouts. |

The five original report-agent scenarios demonstrate **human approval, transient retry, blocked access, persistent failure, and a clean baseline**.

## 3. How the implementation works

**Stack:** React + TypeScript + Vite frontend; Node.js 24 + Express collector; Zod validation; SQLite persistence; VS Code extension; optional OpenAI JavaScript client pointed at Azure.

```text
Agent callbacks -> capture SDK -> validated collector -> SQLite
                                         |
                              timeline / replay / insights
                                         |
                     explicit evidence annotations -> Lens
                                         |
                          verdict / manifest / handoff

VS Code chosen task -> public exit event + file fingerprints
                    -> separate recorder worker -> encrypted vault

Approved evidence preview -> local backend -> Azure -> advisory draft
```

1. **Capture:** SDK wrappers observe callbacks; the collector validates/redacts, orders, and transactionally stores events with per-run write protection and SHA-256 chain checks.
2. **Replay:** A pure reducer rebuilds state up to the selected event, without calling the executor.
3. **Assess:** Lens checks evidence links, result type, order, version/target, and gaps; returns a verdict, reason, source steps, and next check.
4. **Persist:** A separate desktop worker encrypts records/artifacts with AES-256-GCM; VS Code SecretStorage holds the key.
5. **Assist:** Azure receives approved bounded metadata through the backend. Credentials stay server-side; model drafts cannot override verdicts.

**Code map:** `src` = UI; `sdk` = instrumentation; `server` = API/store/policies/MCP/Azure; `shared` = replay/trace logic; `lens` = evidence/recovery/vault; `extension` = VS Code integration; `test` and `e2e` = automated coverage; `presentation\remotion` = editable video.

## 4. The four verdicts

| Verdict | Meaning |
| --- | --- |
| **Supported** | Applicable evidence supports the narrow claim. |
| **Contradicted** | Applicable evidence disagrees with the success/health claim. |
| **Unsupported** | Proof is missing or unsuitable, such as absent links or the wrong result type. |
| **Unverifiable** | Version/scope mismatch, denied access, unknown outcome, or gaps prevent a conclusion. |

**Remember:** old proof does not mean new code is broken; denied access does not mean an unhealthy service; available tools do not prove actual use.

## 5. Start and present it

From the project root:

```powershell
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4180`. The local recorder and synthetic Lens examples need no Azure credentials.

1. **Recordings:** Run **Human in the loop**; inspect the exact pending action.
2. **Replay:** Step backward and inspect state; approve the action and show its local receipt.
3. **Evidence Lens:** Open **The code changed after the test**; explain Unverifiable.
4. **Manifest / Handoff:** Show actual-use links, missing proof, and next checks.
5. **Recovery / Compare:** Approve bounded mock recovery; show Unverifiable -> Supported without rewriting history.
6. **Optional:** Capture a real VS Code task or approve an Azure draft.

Build the installable extension with `npm run extension:package`, then install `artifacts\agent-evidence-lens-0.1.0.vsix`. Task capture needs a trusted local Git workspace; it executes the command you approve.

For Azure, set `AFR_ENABLE_FOUNDRY=1`, `AZURE_OPENAI_BASE_URL` (the `/openai/v1` endpoint), `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_KEY` in the ignored `.env`; restart. Live requests consume quota.

## 6. What to say honestly

- **Working prototype, not a production platform:** single-user and loopback-only; no hosted Foundry agent or multi-tenant deployment.
- **Real versus simulated:** scripted report scenarios perform real local operations/errors. "Send email" creates only a local receipt. Lens assertions run locally; health examples are mocks. Optional Azure inference is real.
- **Replay is not rerun:** replay only reads. Recovery executes only the known bounded mock harness; arbitrary external runtimes receive a handoff, not exact resume.
- **Evidence, not general fact-checking:** requires structured positive assertions; cannot inspect hidden reasoning, private Copilot activity, or arbitrary final-answer semantics.
- **Encryption has a boundary:** only the VS Code vault is encrypted. Original SQLite and reviewed exports are plaintext; browser Lens previews are memory-only.
- **No universal security guarantee:** redaction is best effort, hash chains are not digital signatures, and demo policies do not automatically govern external agents.

Production next steps would include authenticated hosting, stronger provenance, scalable storage, and explicitly implemented runtime adapters.

## 7. Delivery and reference material

Deliverables include the application, SDK/examples, VSIX, Azure integration, GitHub-ready configuration/CI, and documentation. Automated coverage spans core/API behavior, evidence, encryption, browser flows, and the actual VS Code host.

A **two-minute, 1080p Remotion film** adds 14 animated scenes, Maya and her agent, actual screenshots, narration, music/effects, captions, poster, and editable sources. Outputs are in `artifacts\hackathon-video-remotion`; nothing was submitted.

For detail, read [the feature-testing walkthrough](TESTING-WALKTHROUGH.md), [architecture](ARCHITECTURE.md), and [Evidence Lens contract and limits](EVIDENCE-LENS.md).

**Closing pitch:** "We do not ask you to trust the agent's confidence. We help you follow the run, question the claim, and hand over evidence."
