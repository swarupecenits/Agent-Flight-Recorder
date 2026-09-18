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
