import { CurrentEvent, StationConfig } from './types';
import { fetchChsEvents } from './sources/chs';
import { fetchNoaaEvents } from './sources/noaa';

type DayFetcher = (s: StationConfig, dayStart: Date, dayEnd: Date) => Promise<CurrentEvent[]>;

const defaultFetcher: DayFetcher = (s, a, b) =>
  s.provider === 'chs'
    ? fetchChsEvents(s.stationId, a, b)
    : fetchNoaaEvents(s.stationId, s.noaaBin ?? 0, a, b);

function utcDays(start: Date, n: number): string[] {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  return Array.from({ length: n }, (_, i) =>
    new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
}

export async function stationEvents(
  station: StationConfig, start: Date, horizonDays: number,
  cache: Map<string, CurrentEvent[]>, fetcher: DayFetcher = defaultFetcher,
): Promise<CurrentEvent[]> {
  const out: CurrentEvent[] = [];
  for (const day of utcDays(start, horizonDays)) {
    const key = `${station.provider}:${station.stationId}:${day}`;
    let events = cache.get(key);
    if (!events) {
      const dayStart = new Date(`${day}T00:00:00Z`);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      events = await fetcher(station, dayStart, dayEnd);
      cache.set(key, events);
    }
    out.push(...events);
  }
  out.sort((a, b) => a.utc.localeCompare(b.utc));
  return out;
}
