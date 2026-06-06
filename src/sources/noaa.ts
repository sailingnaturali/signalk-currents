import { CurrentEvent, eventFromParts, CurrentKind } from '../types';

const NOAA_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

// NOAA "YYYY-MM-DD HH:MM" is UTC when requested with time_zone=gmt.
function parseNoaaTime(s: string): string {
  return new Date(s.replace(' ', 'T') + 'Z').toISOString();
}

export async function fetchNoaaEvents(
  stationId: string, bin: number, start: Date, end: Date,
  fetchFn: typeof fetch = fetch,
): Promise<CurrentEvent[]> {
  const params = new URLSearchParams({
    product: 'currents_predictions', interval: 'MAX_SLACK', time_zone: 'gmt',
    units: 'english', format: 'json', application: 'signalk-currents',
    station: stationId, bin: String(bin), begin_date: ymd(start), end_date: ymd(end),
  });
  const resp = await fetchFn(`${NOAA_BASE}?${params}`);
  if (!resp.ok) throw new Error(`NOAA ${resp.status}`);
  const cp = (await resp.json())?.current_predictions?.cp ?? [];
  const out: CurrentEvent[] = [];
  for (const row of cp) {
    const kind = String(row.Type ?? '').toLowerCase() as CurrentKind;
    if (kind !== 'slack' && kind !== 'flood' && kind !== 'ebb') continue;
    out.push(eventFromParts(parseNoaaTime(row.Time), kind, parseFloat(row.Velocity_Major)));
  }
  return out;
}
