# Two-minute presenter walkthrough

Start the server and open `http://127.0.0.1:4180`. Have the **Human in the loop** scenario selected. Use fictional data only.

| Time | Action | Suggested narration |
| --- | --- | --- |
| 0:00-0:15 | Show Recordings and the product title. | "Agent Flight Recorder is a black box for agent execution: what was requested, which tools ran, what failed, and why an action was allowed or blocked." |
| 0:15-0:35 | Record Human in the loop. Open the prompt, file-search and report-read events. | "These events come from actual instrumented callbacks. We retain inputs, results, timing, and explicit agent annotations. This demo uses scripted logic and fictional files." |
| 0:35-0:55 | Select the external-recipient policy, then use **Review pending action** to inspect the approval. | "The agent has a summary, but the action has not run. The exact message and policy reason are visible." |
| 0:55-1:15 | Step backward, seek to a prior event, and inspect Recorded state. | "Replay reconstructs the recorded state. It never executes a tool, grants approval, or sends anything." |
| 1:15-1:35 | Approve the action and inspect the new execution events and local receipt. | "Approval and execution are separate events. The result here is a sandbox receipt, not an actual email." |
| 1:35-1:50 | Open a transient-retry run, its failure, and the comparison with a clean baseline. | "Failures and retries remain visible even when the agent recovers. We can compare a newly executed what-if run without rewriting history." |
| 1:50-2:00 | Show export and Connect/MCP. | "The same recorder accepts external instrumentation, exports portable traces, and exposes read-only MCP tools." |

## Useful pre-demo recordings

Record one each of **Recover from a transient error**, **Policy stops a restricted read**, **Debug a persistent failure**, and **Clean baseline** before presenting. These are real runs, not preloaded fabricated telemetry.

Use a fresh **Human in the loop** run for the live presentation so the approval starts pending. Do not resolve all pending approvals as part of automatic setup.

## Reviewer and audience questions

**Is this live Azure OpenAI?** No. The included demonstration is deterministic local code. The SDK can wrap actual model calls, but no live Azure/Foundry connection is configured in this delivered workspace.

**Does replay send the email again?** No. Replay is a pure state reconstruction. Even the original send step only creates a local sandbox receipt.

**Are those private chain-of-thought logs?** No. Decision entries are explicit instrumented annotations and observable policy outcomes.

**Can I instrument another agent?** Yes. Run `npm run demo` to see a separate process capture through HTTP, then adapt `sdk\README.md` to your real callbacks.

**Are the hashes tamper-proof?** They check chain consistency, not authenticated provenance. Someone with full file control can rewrite and rehash the complete recording.

**Does this submit the hackathon entry or upload a video?** No. This folder contains the runnable prototype and presentation materials; it does not modify the Innovation Studio submission.
