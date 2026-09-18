export type AppRoute =
  | { page: 'recordings' }
  | { page: 'insights' }
  | { page: 'policies' }
  | { page: 'connect' }
  | { page: 'invalid'; message: string }
  | { page: 'run'; runId: string; eventSeq: number | null };

function parseEventParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseHash(hash: string): AppRoute {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  let url: URL;
  try { url = new URL(normalized || '/', 'http://local'); }
  catch { return { page: 'invalid', message: 'The recording address is malformed. Use the Recordings link to choose a run.' }; }
  if (url.origin !== 'http://local') return { page: 'invalid', message: 'This is not a local recorder page address.' };
  const path = url.pathname || '/';

  if (path === '/' || path === '') return { page: 'recordings' };
  if (path === '/insights') return { page: 'insights' };
  if (path === '/policies') return { page: 'policies' };
  if (path === '/connect') return { page: 'connect' };
  if (path.startsWith('/runs/')) {
    let runId: string;
    try { runId = decodeURIComponent(path.slice('/runs/'.length)); }
    catch { return { page: 'invalid', message: 'The recording address is malformed. Use the Recordings link to choose a run.' }; }
    const rawEvent = url.searchParams.get('event');
    const eventSeq = parseEventParam(rawEvent);
    if (rawEvent !== null && eventSeq === null) return { page: 'invalid', message: 'Replay position must be a non-negative whole number.' };
    return {
      page: 'run',
      runId,
      eventSeq,
    };
  }
  return { page: 'invalid', message: 'This recorder page does not exist. Use the navigation to choose a page.' };
}

export function recordingsHash(): string {
  return '#/';
}

export function pageHash(page: 'insights' | 'policies' | 'connect'): string {
  return `#/${page}`;
}

export function runHash(runId: string, eventSeq?: number | null): string {
  const query = eventSeq !== null && eventSeq !== undefined ? `?event=${eventSeq}` : '';
  return `#/runs/${encodeURIComponent(runId)}${query}`;
}
