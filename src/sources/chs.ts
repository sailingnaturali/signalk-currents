import { CurrentEvent, eventFromParts } from '../types';

const CHS_BASE = 'https://api-sine.dfo-mpo.gc.ca/api/v1';
const KIND: Record<string, 'slack' | 'flood' | 'ebb'> = {
  SLACK: 'slack', EXTREMA_FLOOD: 'flood', EXTREMA_EBB: 'ebb',
};
const isoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function fetchChsEvents(
  stationId: string, start: Date, end: Date, fetchFn: typeof fetch = fetch,
): Promise<CurrentEvent[]> {
  const params = new URLSearchParams({
    'time-series-code': 'wcp1-events', from: isoZ(start), to: isoZ(end),
  });
  // Encode the station id: it comes from admin config, but keeping it to a
  // single path segment means a stray '/', '?' or '..' can never reshape the
  // request into a different CHS endpoint or host.
  const resp = await fetchFn(`${CHS_BASE}/stations/${encodeURIComponent(stationId)}/data?${params}`);
  if (!resp.ok) throw new Error(`CHS ${resp.status}`);
  const out: CurrentEvent[] = [];
  for (const row of await resp.json()) {
    const kind = KIND[row.qualifier as string];
    if (!kind) continue;
    out.push(eventFromParts(row.eventDate, kind, parseFloat(row.value)));
  }
  return out;
}
