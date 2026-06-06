import { describe, it, expect, vi } from 'vitest';
import { stationData } from '../src/fetch';
import { StationConfig } from '../src/types';

const station: StationConfig = { provider: 'chs', stationId: 'g', label: 'Gillard',
  lat: 50.39, lon: -125.15, floodDir: 160, ebbDir: 340 };

describe('stationData', () => {
  it('fetches each UTC day once and caches', async () => {
    const fetcher = vi.fn(async () => ({ events: [
      { utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 },
    ] }));
    const cache = new Map<string, any>();
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    const b = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(2); // 2 days, cached on 2nd call
  });

  it('carries fetched flood/ebb set, including from cached days', async () => {
    const fetcher = vi.fn(async () => ({
      events: [{ utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 }],
      floodDir: 3, ebbDir: 236,
    }));
    const cache = new Map<string, any>();
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    expect([a.floodDir, a.ebbDir]).toEqual([3, 236]);
    // Second call is served from the day cache — dirs must survive it.
    const b = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher);
    expect([b.floodDir, b.ebbDir]).toEqual([3, 236]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('leaves dirs undefined when no day supplies them (CHS)', async () => {
    const fetcher = vi.fn(async () => ({ events: [] }));
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 1,
      new Map<string, any>(), fetcher);
    expect(a.floodDir).toBeUndefined();
    expect(a.ebbDir).toBeUndefined();
  });
});
