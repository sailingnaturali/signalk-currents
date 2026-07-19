import { fetchCurrentPredictions } from '@sailingnaturali/current-constituents';
import { CurrentEvent, StationDirs, eventFromParts, CurrentKind } from '../types';

export interface NoaaDayData extends StationDirs { events: CurrentEvent[]; }

// NOAA request/response handling lives in @sailingnaturali/current-constituents —
// the same client the constituent extractor uses, so the API's quirks (bin handling,
// the two response shapes, gmt time parsing) are dealt with in one place.
export async function fetchNoaaEvents(
  stationId: string, bin: number, start: Date, end: Date,
  fetchFn: typeof fetch = fetch,
): Promise<NoaaDayData> {
  const rows = await fetchCurrentPredictions(stationId, bin, start, end, {
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
