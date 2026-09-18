# Test the complete project

This walkthrough covers the browser, the VS Code companion, the live Azure integration, and the intentionally disabled boundaries. Use fictional/demo data first.

## 1. Start the app

Open a terminal in the repository root:

```powershell
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4180`.

If the backend is already running, reuse it rather than starting a second instance. To restart your own foreground instance, press Ctrl+C in that terminal, then run `npm start` again. Existing recordings are preserved. Do not delete the database to solve a port or ownership conflict.

Node.js 24 and npm 11+ are required. On the managed npm 12 environment, if installation reports `EALLOWREMOTE`, use `npm ci --allow-remote=all --no-audit --no-fund`. Do not disable TLS.

The original recorder saves to `data\flight-recorder.sqlite`. The browser Evidence Lens holds its separate preview **in memory only**. Use the VS Code companion in step 11 for encrypted persistence.

## 2. Make the interface yours

Click **Make it yours**.

1. Switch between **Paper**, **Graphite**, and **Match device**.
2. Try **Ember**, **Teal**, and **Cobalt** accents.
3. Choose **More on screen** or **Room to breathe**.
4. Switch **Text size** to **Larger**.
5. Choose **Essentials first** or **Show recorded data**.
6. Select **Keep it still** for reduced motion.
7. Close the dialog and reload before creating a browser Lens recording.

Expected: display preferences persist. Data capture and external-analysis settings are separate. A browser Lens recording is not saved by changing appearance.

Press **Ctrl+K**, search for `evidence`, and open Evidence Lens. Use Tab/Enter and Escape through the interface. Within Evidence tabs, use Left/Right/Home/End. At a narrow/mobile viewport, controls reflow and tables scroll within their own container.

## 3. Record and approve the original report agent

Open **Recordings**, select **Human in the loop**, and click **Record demo**.

Expected: the real local fixture search/read completes and the run pauses at **Awaiting approval**.

1. Click **Review pending action**.
2. Open **Inspect pending tool input** to see exactly what would be written.
3. Enter a reviewer label and an optional note.
4. Click **Approve action**.
5. Inspect **Local outbox receipts**.

Expected: one local receipt and a completed run. **No actual email is sent.** Duplicate approval requests cannot deliver twice.

Repeat with a fresh approval scenario and choose **Reject action**. Expected: the run is blocked and no receipt exists.

## 4. Rewind without repeating an action

In a recorded run, use **Previous**, **Next**, **Play**, **Reset**, the position slider, and the speed selector. Enable **Break on errors and policies**. Use the Errors/Policies/Tools/Models filters.

Click a timeline step and expand individual **Inspect ...** sections under Event payload or Recorded state.

Expected: the displayed state follows the selected prefix. Replaying never calls a tool, resolves an approval, or creates another receipt. Turn **Follow newest live event** back on when you want to follow an active run instead of holding a historical position.

## 5. Try every original execution scenario

| Scenario in Recordings | Expected result |
| --- | --- |
| Human in the loop | Waits for approval, then completes or is rejected. |
| Recover from a transient error | One failed attempt, one explicit retry, then success. |
| Policy stops a restricted read | Read is blocked before the restricted callback executes. |
| Debug a persistent failure | Real JSON parse failures and a failed run. |
| Clean baseline | Successful local fixture run and one sandbox receipt. |

On a failed/retried demo, choose **Clean baseline** under **Scenario for rerun**, then **Start rerun**. Choose the earlier run under **Comparison run**.

Expected: a new, parent-linked execution and a comparison of actual outcomes/metrics. This is not a rewind of the old runtime.

Also try run search/status filters, **Insights**, **Policies**, and JSON/Markdown/OTLP downloads. Import a native JSON file from Recordings. Identical captures reopen; malformed or modified chains are rejected.

## 6. Check whether the proof still applies

Open **Evidence Lens**, choose an example, and click **Try local example**. Allow local evidence when asked.

| Example | Expected finding |
| --- | --- |
| The code changed after the test | **Unverifiable**: version A passed, but version B was delivered without a fresh check. B is not declared broken. |
| The result disagrees with the claim | **Contradicted**: actual fixture assertions failed for the applicable version. |
| Right result, wrong environment | **Unverifiable**: staging cannot prove production. |
| The check could not get access | **Unverifiable**: a labeled mock denied query cannot establish service health. |
| Fresh proof for the final change | **Supported** for the narrow explicitly linked validation claim. |

The unit assertions actually run in memory. Health responses are clearly labeled mocks, not probes of your Azure resources.

In **Review**, inspect the claim, verdict, reason, and next check. Click **See the result**. Expected: Timeline selects the actual linked observation. Use playback and **Pause at concerns**; no network/tool execution occurs during replay.

## 7. Inspect the Manifest

Open **Manifest**.

Expected: available and actually used are different columns. In the unit-test example, the in-memory harness has linked usage, while the mock health server is available but was not used. Missing versions and capture gaps remain visible.

Click a linked-step count to jump back to the evidence. Do not interpret an item marked "available" as proof the agent invoked it.

## 8. Correct, recover, and compare

Start with **The code changed after the test**.

1. In Review, click **Draft a clearer claim**.
2. Read the proposed correction and save it.
3. Open **Handoff** and find the separate reviewed note. The original verdict remains Unverifiable.
4. Open **Recovery** and select the concern.
5. Keep the earlier compatible checkpoint, or explicitly choose a fresh mock run.
6. Click **Review recovery plan**.
7. Read the **Actual restart boundary**, proposed correction, effects, and limits.
8. Click **Approve this plan & create new run**.
9. Open **Compare**.

Expected: the new run has fresh passing validation and a Supported claim; the comparison shows Unverifiable -> Supported. Reopen the original and confirm it has not changed.

The mock has a fixed known fixture, zero external writes, and no live-tool fallback. Recovery from an imported arbitrary runtime offers a **handoff only**, not fake exact resume.

## 9. Build and review a handoff

Open **Handoff**.

Check **What holds up**, **What still needs a check**, and the full evidence-linked summary. Review notes and model drafts are shown separately.

Click **Review handoff export** or **Review recording export**. Read the exact preview, then either cancel or save.

Expected: nothing is exported when cancelled. Approved downloads are explicitly **plaintext**. The Markdown handoff includes navigable source-step references, unresolved claims, and required checks. The immutable JSON does not silently incorporate separate human/model notes.

## 10. Exercise the real Azure model

The backend loads the local ignored `.env`. For a fresh checkout only:

```powershell
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item .env.example .env }
```

Edit `.env` locally:

```dotenv
AFR_ENABLE_FOUNDRY=1
AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE.services.ai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=YOUR-DEPLOYMENT
AZURE_OPENAI_API_KEY=YOUR-ROTATED-KEY
```

Use your existing deployment. The project endpoint is reference context; inference uses the `/openai/v1` endpoint. Restart the backend after changing its environment. Never use `VITE_*` for secrets. A key disclosed in chat should be rotated and replaced locally, not pasted into another conversation.

In Evidence Lens:

1. Choose **The code changed after the test**.
2. Click **Use live Azure**.
3. Review the exact synthetic evidence and destination. Cancel once to confirm no model request is sent.
4. Repeat and approve the live request.
5. Open **Handoff** for the advisory model draft.
6. Open **Timeline**, select **Azure completed a real streamed response**, and inspect **Measured model activity**.

Expected: a real response ID, returned model identifier, measured token counts, stream-delta count, and duration. The deterministic Unverifiable verdict is not rewritten by the model. The demo's tools remain synthetic/in-memory; the model request is real.

With any recording selected, **Draft with Azure** separately previews the minimized claim/scope metadata. It can contain repository/resource identities, so review the actual payload. Raw source files, prompts, and captured excerpts are not included in this projection.

For a small terminal demonstration:

```powershell
npm run demo:live
```

This makes a real, quota-consuming model request and a fixed local mock recovery, prints the measured result, and does not export a recording or key.

Expected failures are explicit: missing configuration, access/network failure, quota/rate errors, timeout, or incomplete response. There is no scripted-success fallback. If you reach the per-session 32-request/preview limit, deliberately restart the backend.

## 11. Install the real VS Code companion

Build the local package, if it has not already been generated:

```powershell
npm run extension:package
```

In VS Code:

1. Run **Extensions: Install from VSIX**.
2. Select `artifacts\agent-evidence-lens-0.1.0.vsix`.
3. Open your local project folder.
4. Open the **Evidence Lens** activity-bar icon.
5. Choose **Open evidence workbench**.
6. Try a local example and approve local recording.
7. Close/reopen the workbench or reload VS Code.

Expected: the recordings and separate review notes remain available. The encryption key is in SecretStorage; data/artifact envelopes are encrypted under the extension's profile-scoped storage. No key is written to the repository or webview.

The extension offers the same Review/Timeline/Manifest/Handoff/Compare/Recovery/Privacy interface. Its **Bring in a collector run** action imports an encrypted derivative while leaving the original SQLite recording untouched.

If your backend uses another port, change the application-level setting **Agent Evidence Lens: Collector URL** to that loopback address.

## 12. Capture a real selected task

In VS Code, open a **trusted local Git repository root**, save your editor buffers, and use a task you understand. This companion stays in the local desktop host; remote SSH/WSL/container/Codespaces folders are not supported for task capture or instruction edits.

1. Choose **Capture a task I choose**, or run **Evidence Lens: Capture a Selected Validation Task**.
2. Choose the workspace if several are open.
3. Select an existing foreground task or the offered `npm test` task when the package has a test script.
4. Review the exact command and effects, then approve.
5. Inspect its result in Review and Timeline.

Expected: actual public task exit status and before/after bounded file-set fingerprints. With exit zero, unchanged complete fingerprints, and no relevant capture gap, the narrow task-completion assertion is Supported. The adapter generates this candidate check; it is not an intercepted final answer or an inferred "all tests passed" count.

Repeat with a known failing task. Expected: a Contradicted success claim for the applicable scope. Repeat while changing/saving a relevant file during a sufficiently long validation, or leave a dirty buffer: expected Unverifiable because the final code boundary is not established.

This executes real workspace code, not the isolated mock harness. Task observation is cancellable; cancellation does not automatically kill the task. Watchers/background tasks are excluded.

## 13. Review a scoped instruction proposal

In the VS Code companion, select an unresolved recording and open Handoff.

1. Click **Propose a reviewed workspace rule**.
2. Choose the exact workspace.
3. Read the displayed before/after diff.
4. Cancel once and confirm no file is written.
5. Repeat and choose **Apply reviewed rule** only if you want it.

Expected: only `.github\instructions\evidence-lens.instructions.md` in the selected workspace is changed. An encrypted proposal/review artifact is retained. Other instruction files and global settings are untouched. A concurrent edit or linked target blocks the write. No agent is claimed to have consumed the rule merely because it exists.

## 14. Test privacy, source health, and retention

Open **Privacy**, then **Change privacy choices**.

- Disable local recording: future import/record operations require renewed consent. Existing records are not silently erased.
- Leave supplied content off: imported raw prompts/results/excerpts are omitted and their absence is visible.
- Enable content only for an authorized import when you need an exact quote check.
- Task capture and external analysis are opt-in; external requests still require previews.
- Set a retention period and, in VS Code, choose **Review expired records**.

Fresh records should report **no expired records**. Once records are old enough, the exact list must be approved before deletion. Retention is based on local save time, not an imported timestamp. Do not edit ciphertext to simulate aging; the automated vault tests cover expiry and approved deletion.

Source health should show private Copilot panels, arbitrary CLI/Agency resume, and opaque MCP internals as unavailable. Those disabled surfaces are intentional, not missing authentication setup.

Keep your VS Code profile/SecretStorage and encrypted vault together. Removing a vault key is not a supported reset procedure: key loss blocks decryption rather than silently generating a replacement over existing records.

## 15. Try every verdict and citation-content boundary

```powershell
npm run demo:evidence-fixtures
```

Import files from `artifacts\evidence-examples`:

- `unsupported.json`: Unsupported because no result is linked.
- `citation.json` with default minimization: Unverifiable because the exact quote/source excerpt is not retained.
- Enable **Include supplied content**, rerun the fixture command to create fresh recording IDs, then import the new `citation.json`: Supported for exact quotation fidelity only.

Reusing the same ID with different captured content is rejected to protect immutable history. A quote match does not prove a broader semantic claim or authenticate a real publication.

## 16. Connect your own Node/Python agent and MCP client

With the backend running:

```powershell
npm run demo
npm run demo:evidence
python .\examples\capture-python-agent.py
```

The second command executes two versioned SDK recordings: a stale-proof case and a fresh-proof case. Open the printed Evidence URLs, or import the generated native JSON into VS Code. Expected verdicts are Unverifiable and Supported.

Read `sdk\README.md` and `docs\EVIDENCE-LENS.md` before instrumenting your own code. Supply real measurements, stable version/scope identifiers, compatible positive assertion kinds, and actual evidence IDs.

Use **Connect** for the local MCP URL and API examples. MCP exposes five read-only operations: list runs, trace events, replay state, failures, and comparison. It cannot approve actions, run recovery, or deliver messages.

## Automated checks

```powershell
npm run check
npm run browser:install
npm run test:e2e
npm run test:extension
npm run extension:package
```

`npm run check` includes the UI build, extension typecheck/bundle, core/HTTP/provider tests, encrypted-vault cases, and an actual child-worker test. The browser suite checks original workflows, evidence/recovery, themes, keyboard behavior, mobile layout, and automated accessibility rules. Its backend explicitly disables external models.

`npm run test:extension` uses your installed VS Code in a fresh, temporary test profile and synthetic Git workspace. It tests real SecretStorage, a separate recorder process, persistence/reopening, key-loss refusal, selected-task capture, and checkpoint recovery. It does not alter your normal profile. Set `VSCODE_EXECUTABLE` if VS Code is installed elsewhere.

Use `AFR_BROWSER` to select an existing Edge/Chromium executable instead of downloading Playwright Chromium. Live Azure testing is deliberately separate from CI and may consume model quota.
