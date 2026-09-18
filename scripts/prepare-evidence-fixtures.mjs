import { mkdir, writeFile } from 'node:fs/promises';
import { addEvent, newRecording, seal, hash, validateRecording } from '../lens/schema.ts';
import { createExample, exampleScenarios } from '../lens/examples.ts';

const directory = new URL('../artifacts/evidence-examples/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const scenario of exampleScenarios) await writeFile(new URL(`${scenario.id}.json`, directory), JSON.stringify(createExample(scenario.id), null, 2));
const citation = newRecording('Citation fidelity - fictional source', 'citation-fixture', 'mock');
citation.contentCapture = 'included';
addEvent(citation, { type: 'run.started', name: 'Open the fictional source fixture' });
const excerpt = 'Validation proves only the code version and scope that was actually checked.';
const evidence = addEvent(citation, { type: 'tool.result', name: 'Captured source excerpt', observation: {
  kind: 'citation', outcome: 'succeeded', sourceId: 'fixture:evidence-guide', sourceVersion: '1', excerpt, excerptHash: hash(excerpt),
} });
addEvent(citation, { type: 'claim', name: 'Exact-quotation claim', claim: { kind: 'citation', text: 'The captured source contains the supplied quotation.',
  quote: 'the code version and scope that was actually checked', appliesTo: 'captured', evidenceIds: [evidence.id] } });
addEvent(citation, { type: 'run.finished', name: 'Citation fixture complete' });
citation.run.status = 'completed'; citation.run.endedAt = new Date().toISOString();
citation.gaps.push({ code: 'SYNTHETIC_SOURCE', detail: 'Fictional source text for quote-fidelity demonstration. This does not authenticate a real publication or verify a broader semantic conclusion.' });
await writeFile(new URL('citation.json', directory), JSON.stringify(validateRecording(seal(citation)), null, 2));
const unsupported = createExample('corrected');
unsupported.run.name = 'A claim with no linked proof';
unsupported.events.find(event => event.claim).claim.evidenceIds = [];
await writeFile(new URL('unsupported.json', directory), JSON.stringify(seal(unsupported), null, 2));
console.log('Created seven synthetic files under artifacts\\evidence-examples. Each invocation creates new recording IDs; no cloud call is made.');
