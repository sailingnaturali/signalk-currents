import { CurrentEvent, StationConfig, StationDirs } from './types';
import { fetchChsEvents, fetchChsDirections } from './sources/chs';
import { fetchNoaaEvents } from './sources/noaa';

// One UTC day of predictions, plus the provider-measured set directions when the
// per-day feed carries them (NOAA does; CHS carries them in station metadata, an
// out-of-band lookup handled separately below).
export interface DayData extends StationDirs { events: CurrentEvent[]; }

type DayFetcher = (s: StationConfig, dayStart: Date, dayEnd: Date) => Promise<DayData>;
type DirFetcher = (s: StationConfig) => Promise<StationDirs>;

const chsLiveId = (s: StationConfig): string => {
  if (!s.liveId) throw new Error(`no live id for ${s.label}`);
  return s.liveId;
};

const defaultFetcher: DayFetcher = async (s, a, b) =>
  s.provider === 'chs'
    ? { events: await fetchChsEvents(chsLiveId(s), a, b) }
    : fetchNoaaEvents(s.stationId, s.noaaBin ?? 0, a, b);

// Directions are static per station, so they only need fetching for CHS (NOAA
// supplies them inline with each day's events).
const defaultDirFetcher: DirFetcher = (s) =>
  s.provider === 'chs' ? fetchChsDirections(chsLiveId(s)) : Promise.resolve({});

function utcDays(start: Date, n: number): string[] {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  return Array.from({ length: n }, (_, i) =>
    new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
}

export async function stationData(
  station: StationConfig, start: Date, horizonDays: number,
  cache: Map<string, DayData>, fetcher: DayFetcher = defaultFetcher,
  dirFetcher: DirFetcher = defaultDirFetcher,
): Promise<DayData> {
  const events: CurrentEvent[] = [];
  let floodDir: number | undefined, ebbDir: number | undefined;
  for (const day of utcDays(start, horizonDays)) {
    const key = `${station.provider}:${station.stationId}:${day}`;
    let data = cache.get(key);
    if (!data) {
      const dayStart = new Date(`${day}T00:00:00Z`);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      data = await fetcher(station, dayStart, dayEnd);
      cache.set(key, data);
    }
    events.push(...data.events);
    floodDir = floodDir ?? data.floodDir;
    ebbDir = ebbDir ?? data.ebbDir;
  }

  // CHS set directions live in station metadata, not the per-day event feed, so
  // fetch them once (cached for the process lifetime — they're static) when the
  // day loop didn't already supply a direction.
  if (floodDir === undefined && ebbDir === undefined) {
    const dirKey = `${station.provider}:${station.stationId}:dirs`;
    let dirs = cache.get(dirKey);
    if (!dirs) {
      dirs = { events: [], ...(await dirFetcher(station)) };
      cache.set(dirKey, dirs);
    }
    floodDir = dirs.floodDir;
    ebbDir = dirs.ebbDir;
  }

  events.sort((a, b) => a.utc.localeCompare(b.utc));
  return { events, floodDir, ebbDir };
}
