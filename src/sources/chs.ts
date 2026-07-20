import { CurrentEvent, StationDirs, eventFromParts } from '../types';

const CHS_BASE = 'https://api-sine.dfo-mpo.gc.ca/api/v1';
const KIND: Record<string, 'slack' | 'flood' | 'ebb'> = {
  SLACK: 'slack', EXTREMA_FLOOD: 'flood', EXTREMA_EBB: 'ebb',
};
const isoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const finite = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// A cold start fetches every configured station back-to-back, and CHS 429s the
// tail of that burst — which used to leave those stations silently empty until
// the next poll. Retry the throttled request a couple of times before giving up.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chsFetch(url: string, fetchFn: typeof fetch): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const resp = await fetchFn(url);
    if (resp.status !== 429 || attempt >= 2) return resp;
    await sleep(500 * 2 ** attempt);
  }
}

export async function fetchChsEvents(
  stationId: string, start: Date, end: Date, fetchFn: typeof fetch = fetch,
): Promise<CurrentEvent[]> {
  const params = new URLSearchParams({
    'time-series-code': 'wcp1-events', from: isoZ(start), to: isoZ(end),
  });
  // Encode the station id: it comes from admin config, but keeping it to a
  // single path segment means a stray '/', '?' or '..' can never reshape the
  // request into a different CHS endpoint or host.
  const resp = await chsFetch(`${CHS_BASE}/stations/${encodeURIComponent(stationId)}/data?${params}`, fetchFn);
  if (!resp.ok) throw new Error(`CHS ${resp.status}`);
  const out: CurrentEvent[] = [];
  for (const row of await resp.json()) {
    const kind = KIND[row.qualifier as string];
    if (!kind) continue;
    out.push(eventFromParts(row.eventDate, kind, parseFloat(row.value)));
  }
  return out;
}

// CHS publishes the station's set directions in its metadata (floodDirection /
// ebbDirection, °true) — the authoritative source, equivalent to NOAA's
// meanFloodDir/meanEbbDir. The wcp1-events feed carries only times and rates, so
// directions are a separate (static) metadata lookup.
export async function fetchChsDirections(
  stationId: string, fetchFn: typeof fetch = fetch,
): Promise<StationDirs> {
  const resp = await chsFetch(`${CHS_BASE}/stations/${encodeURIComponent(stationId)}/metadata`, fetchFn);
  if (!resp.ok) throw new Error(`CHS metadata ${resp.status}`);
  const m = await resp.json();
  return { floodDir: finite(m.floodDirection), ebbDir: finite(m.ebbDirection) };
}
