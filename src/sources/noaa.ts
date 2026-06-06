import { CurrentEvent, StationDirs, eventFromParts, CurrentKind } from '../types';

const NOAA_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

// NOAA "YYYY-MM-DD HH:MM" is UTC when requested with time_zone=gmt.
function parseNoaaTime(s: string): string {
  return new Date(s.replace(' ', 'T') + 'Z').toISOString();
}

export interface NoaaDayData extends StationDirs { events: CurrentEvent[]; }

export async function fetchNoaaEvents(
  stationId: string, bin: number, start: Date, end: Date,
  fetchFn: typeof fetch = fetch,
): Promise<NoaaDayData> {
  const params = new URLSearchParams({
    product: 'currents_predictions', interval: 'MAX_SLACK', time_zone: 'gmt',
    units: 'english', format: 'json', application: 'signalk-currents',
    station: stationId, bin: String(bin), begin_date: ymd(start), end_date: ymd(end),
  });
  const resp = await fetchFn(`${NOAA_BASE}?${params}`);
  if (!resp.ok) throw new Error(`NOAA ${resp.status}`);
  const cp = (await resp.json())?.current_predictions?.cp ?? [];
  const events: CurrentEvent[] = [];
  let floodDir: number | undefined, ebbDir: number | undefined;
  for (const row of cp) {
    // Every row repeats the station/bin's measured principal directions; take
    // the first finite pair — this is the authority config can't match.
    if (floodDir === undefined && Number.isFinite(Number(row.meanFloodDir))) {
      floodDir = Number(row.meanFloodDir);
    }
    if (ebbDir === undefined && Number.isFinite(Number(row.meanEbbDir))) {
      ebbDir = Number(row.meanEbbDir);
    }
    const kind = String(row.Type ?? '').toLowerCase() as CurrentKind;
    if (kind !== 'slack' && kind !== 'flood' && kind !== 'ebb') continue;
    events.push(eventFromParts(parseNoaaTime(row.Time), kind, parseFloat(row.Velocity_Major)));
  }
  return { events, floodDir, ebbDir };
}
