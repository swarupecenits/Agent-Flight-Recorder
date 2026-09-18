export function verifyChain(
  header: { id: string; traceId: string },
  events: { id: string; seq: number; runId: string; traceId: string; previousHash: string; hash: string }[],
  expectedRoot: string,
): { valid: boolean; checkedEvents: number; rootHash: string };
export const TERMINAL_TYPES: ReadonlySet<string>;
export const TERMINAL_STATUSES: ReadonlySet<string>;
