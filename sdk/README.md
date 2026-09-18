# Node capture SDK

The SDK has no runtime package dependencies and uses built-in Node HTTP fetch, crypto, timers, and async context. Use Node 22+ for the SDK; the recorder application itself uses Node 24+.
TypeScript declarations are included alongside the JavaScript module.

Import `sdk\recorder.mjs` from this project, or install the local `sdk` folder into a separate application using your package manager. It is not claimed to be published to a public registry.

## Automatic lifecycle

```javascript
import { FlightRecorder } from './sdk/recorder.mjs';
const recorder = new FlightRecorder({ baseUrl: 'http://127.0.0.1:4180' });

await recorder.run({
  name: 'Customer lookup',
  agentName: 'support-agent',
  input: { customerId: 'fictional-42' },
  metadata: { environment: 'local' },
}, async run => {
  await run.prompt('Find the customer record');
  const result = await run.tool(
    'LookupCustomer',
    { customerId: 'fictional-42' },
    async () => ({ id: 'fictional-42', plan: 'demo' }),
  );
  await run.decision('Return the public account fields', { selectedCustomer: result.id });
  return result;
});
```

The return value becomes the final output. An exception records a failed run and is rethrown to the caller. Await every asynchronous operation before returning from the callback.

## Methods

| Method | Meaning |
| --- | --- |
| `recorder.startRun(input)` | Start explicitly; returns a run handle with ID, trace ID, and confidential write token. |
| `recorder.run(input, callback)` | Start, invoke the callback, capture final output, and finish or fail. |
| `run.prompt(json)` | Capture an observable prompt. |
| `run.decision(note, stateDelta)` | Record an explicit annotation and shallow state changes. This is not hidden model reasoning. |
| `run.tool(name, input, callback, options)` | Capture actual input, attempt start, output/error, duration, retry events, and nested parent spans. |
| `run.model(name, input, callback, options)` | Wrap a real model client, or an explicitly labeled test double. The recorder does not choose or deploy a model. |
| `run.policy(tool, result, input)` | Record your application's actual policy outcome and reason. This method is observation, not automatic enforcement. |
| `run.event(type, name, fields)` | Record a supported custom instrumentation event. Lifecycle events are reserved. |
| `run.output(json)` | Record an intermediate output. |
| `run.finish({status, output?, error?})` | Explicit termination; status is completed, failed, blocked, or interrupted. |

`stateDelta` shallow-merges named keys into the replay context. Set a value to JSON `null` to represent a cleared value. Dates should be ISO strings; convert errors/class instances/buffers into plain JSON yourself. Tool callbacks returning `undefined` are recorded with a JSON null output.

## Retries and measured usage

```javascript
const result = await run.tool('ReadReport', { reportId }, readReport, {
  attempts: 2,                         // default 1; maximum 5
  retryDelayMs: 80,
  retryIf: error => error.code === 'TRANSIENT',
});

const response = await run.model('Your deployed model', request, callYourModel, {
  attributes: { provider: 'your-provider', model: 'your-deployment' },
  getUsage: response => ({
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
  }),
});
```

Adapt `getUsage` to your actual provider response and omit it when usage is unavailable. Counts must be non-negative integers. The application never substitutes an estimated token count or cost.

Only opt into retries for operations safe to repeat. Default attempts is one. Callback failures may trigger an explicit retry; **recording or serialization failures after a successful callback never cause its side effect to be retried**.

Instrumentation is **fail-closed**: a failed start-event write prevents the wrapped callback from executing. Later recording failures reject rather than silently losing telemetry. If a failure occurs after a side effect has happened, that side effect cannot be undone by the recorder; an unfinished span is shown as unknown, not successful.

## Privacy and transport

Credential-pattern redaction runs before HTTP transmission, and again at the collector. Redacted fields are listed on captured events. It is not a DLP system: avoid recording sensitive content, and review exports before sharing.

`writeToken` is a per-run capture credential. Do not print, share, or put it in source control. It is not returned by the read, report, or export endpoints.

Nested callbacks use `AsyncLocalStorage` to retain parent span IDs. Concurrent calls receive their final sequence numbers atomically at the collector. Sequence is **collector arrival order**, while client timestamps are retained separately from server `recordedAt`.

HTTP recording writes use a 15-second timeout. There is no silent offline queue. The events endpoint supports idempotency for the same explicit event ID and identical payload; a different payload using that ID is rejected.

The optional `transport` constructor argument is an internal/test extension with `createRun(input)`, `append(runId, writeToken, event)`, and `finish(runId, writeToken, result)`. The included demo uses the same SDK with an in-process transport to the same validated store.

## Version-bound evidence annotations

The ordinary recorder works without evidence annotations. To evaluate claims in Evidence Lens, explicitly supply the version, scope, measured observation, and evidence links. Tool names or a successful HTTP response alone are not proof of test success or service health.

The complete runnable example is `examples\capture-evidence-agent.mjs`:

```powershell
npm run demo:evidence
```

It performs actual local assertions and HTTP SDK capture twice, exports native JSON, and checks the Lens API results: an older passing result is **Unverifiable** for the changed final code; a fresh passing result is **Supported**. Its data is labeled fictional. No model or external infrastructure call is made.

### Annotation contract

| Location | Fields |
| --- | --- |
| Start-run `metadata.evidenceLens` | `{version: 1, finalScope?, inventory?}` |
| Event `attributes.lens` | `{version: 1, scope?, contextSnapshot?, observation?, claim?, assetIds?}` |
| `scope` / `finalScope` | Optional known `repositoryId`, `codeVersion`, `suite`, `environment`, `resourceId`, `queryScope`. Unknown values stay absent. Include a full resource identity/query scope where needed to distinguish tenants, subscriptions or namespaces. |
| `observation` | A compatible positive assertion kind (`test`, `action`, `health`, `citation`), actual outcome, and applicable measurements. Citation observations use `sourceId`, `sourceVersion`, `excerpt`, and `excerptHash`. |
| `claim` | `{kind, text, appliesTo: "final" \| "captured", evidenceIds: [...]}`; citation-fidelity claims additionally supply `quote`. |
| `inventory` item | `{kind, id, name, version: string \| null, available: boolean, usedBy: [...]}`; event `assetIds` also link usage to actual captured steps. |

Refer to `lens\types.ts` and `lens\schema.ts` for the full checked contract. For example, a test observation needs an actual compatible exit status; the engine does not turn an unknown exit code into a pass.

Inside an already started run, the linking pattern is:

```javascript
// These values must come from your actual validation and version measurement.
const observed = await run.event('decision', 'Observed validation result', {
  attributes: {
    lens: {
      version: 1,
      scope: observedScope,
      observation: {
        kind: 'test',
        outcome: result.exitCode === 0 ? 'passed' : 'failed',
        exitCode: result.exitCode,
        passed: result.passed,
        failed: result.failed,
      },
      assetIds: ['your-validation-harness'],
    },
  },
});
await run.event('decision', 'Final captured version', {
  attributes: { lens: { version: 1, scope: finalScope, contextSnapshot: true } },
});
await run.event('decision', 'Final validation claim', {
  attributes: {
    lens: {
      version: 1, scope: finalScope,
      claim: {
        kind: 'test', text: 'The final captured version passes this test suite.',
        appliesTo: 'final', evidenceIds: [observed.id],
      },
    },
  },
});
```

Declare the harness in `metadata.evidenceLens.inventory` before referencing its asset ID. Use actual immutable identifiers/fingerprints, not a moving branch name, guessed revision, or invented environment. Publish a new context snapshot when the delivered version changes. Claims must reference real earlier event IDs.

The checker evaluates the declared positive assertion kind and exact linked scope. It is not a general natural-language fact checker. `appliesTo: "captured"` is for a claim explicitly about that earlier version/target, not a way to relabel a final-code claim as supported.

Native export preserves the source hash chain. Lens verifies that chain, then creates a minimized derivative by default. It does not infer missing manifests, expose hidden reasoning, restore arbitrary runtimes, or authenticate the original source. See `docs\EVIDENCE-LENS.md` for the complete boundaries.
