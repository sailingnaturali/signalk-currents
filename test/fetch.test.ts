import { describe, it, expect, vi } from 'vitest';
import { stationEvents } from '../src/fetch';
import { StationConfig } from '../src/types';

const station: StationConfig = { provider: 'chs', stationId: 'g', label: 'Gillard',
  lat: 50.39, lon: -125.15, floodDir: 160, ebbDir: 340 };

describe('stationEvents', () => {
  it('fetches each UTC day once and caches', async () => {
    const fetcher = vi.fn(async () => [
      { utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 },
    ]);
    const cache = new Map<string, any>();
    const a = await stationEvents(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    const b = await stationEvents(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(2); // 2 days, cached on 2nd call
  });
});
