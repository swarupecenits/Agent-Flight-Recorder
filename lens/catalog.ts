import type { LensSettings } from './types.ts';
export const defaultSettings: LensSettings = {
  consent: false, captureContent: false, liveCapture: false, externalAnalysis: false, retentionDays: 30,
};
export const exampleScenarios = [
  { id: 'stale', name: 'The code changed after the test', description: 'A real in-memory check passes for version A. The fixture changes to B without a fresh check.' },
  { id: 'contradiction', name: 'The result disagrees with the claim', description: 'Real failing assertions, followed by a deliberately incorrect passed-tests claim.' },
  { id: 'scope', name: 'Right result, wrong environment', description: 'A labeled mock response checks staging. The final claim names production.' },
  { id: 'denied', name: 'The check could not get access', description: 'A labeled mock 403 response tells us nothing about service health.' },
  { id: 'corrected', name: 'Fresh proof for the final change', description: 'The harness checks version B and links its new result to the claim.' },
] as const;
export type ExampleId = typeof exampleScenarios[number]['id'];
