import { fetchCurrentPredictions } from '@sailingnaturali/current-stations';
import { CurrentEvent, StationDirs, eventFromParts, CurrentKind } from '../types';

export interface NoaaDayData extends StationDirs { events: CurrentEvent[]; }

// NOAA request/response handling lives in @sailingnaturali/current-stations —
// the same client the constituent extractor uses, so the API's quirks (bin handling,
// the two response shapes, gmt time parsing) are dealt with in one place.
export async function fetchNoaaEvents(
  stationId: string, bin: number, start: Date, end: Date,
  fetchFn: typeof fetch = fetch,
): Promise<NoaaDayData> {
  // `end` is EXCLUSIVE — callers pass the next day's 00:00Z (fetch.ts). The CO-OPS
  // client sends begin_date/end_date as bare YMD, which the API reads inclusively, so
  // passing it through asks for the day AND its successor. Over a multi-day horizon
  // those windows overlap and the caller concatenates the overlap: Boundary Pass
  // served 48 events for a 3-day horizon, 16 of them duplicates, which surfaced to
  // agents as the same slack time listed twice. Step back inside the window.
  const lastInstant = new Date(end.getTime() - 1);
  const rows = await fetchCurrentPredictions(stationId, bin, start, lastInstant, {
    fetchFn, paceMs: 0, application: 'signalk-currents',
  });

  const events: CurrentEvent[] = [];
  let floodDir: number | undefined, ebbDir: number | undefined;
  for (const row of rows) {
    // Every row repeats the station/bin's measured principal directions; take
    // the first finite pair — this is the authority config can't match.
    if (floodDir === undefined && Number.isFinite(row.meanFloodDir)) floodDir = row.meanFloodDir;
    if (ebbDir === undefined && Number.isFinite(row.meanEbbDir)) ebbDir = row.meanEbbDir;
    const kind = row.kind as CurrentKind;
    if (kind !== 'slack' && kind !== 'flood' && kind !== 'ebb') continue;
    events.push(eventFromParts(row.time, kind, row.velocityMajor));
  }
  return { events, floodDir, ebbDir };
}
