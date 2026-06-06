import { CurrentEvent, StationConfig, StationDirs } from './types';
import { fetchChsEvents } from './sources/chs';
import { fetchNoaaEvents } from './sources/noaa';

// One UTC day of predictions, plus the provider-measured set directions when
// the provider supplies them (NOAA does; CHS doesn't).
export interface DayData extends StationDirs { events: CurrentEvent[]; }

type DayFetcher = (s: StationConfig, dayStart: Date, dayEnd: Date) => Promise<DayData>;

const defaultFetcher: DayFetcher = async (s, a, b) =>
  s.provider === 'chs'
    ? { events: await fetchChsEvents(s.stationId, a, b) }
    : fetchNoaaEvents(s.stationId, s.noaaBin ?? 0, a, b);

function utcDays(start: Date, n: number): string[] {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  return Array.from({ length: n }, (_, i) =>
    new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
}

export async function stationData(
  station: StationConfig, start: Date, horizonDays: number,
  cache: Map<string, DayData>, fetcher: DayFetcher = defaultFetcher,
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
  events.sort((a, b) => a.utc.localeCompare(b.utc));
  return { events, floodDir, ebbDir };
}
