import { describe, it, expect, vi } from 'vitest';
import { stationData } from '../src/fetch';
import { StationConfig } from '../src/types';
import * as chs from '../src/sources/chs';

const station: StationConfig = { provider: 'chs', stationId: 'g', label: 'Gillard',
  lat: 50.39, lon: -125.15 };

const noDirs = async () => ({});

describe('stationData', () => {
  it('fetches each UTC day once and caches', async () => {
    const fetcher = vi.fn(async () => ({ events: [
      { utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 },
    ] }));
    const cache = new Map<string, any>();
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, noDirs);
    const b = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, noDirs);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(2); // 2 days, cached on 2nd call
  });

  it('carries fetched flood/ebb set inline, including from cached days (NOAA)', async () => {
    const fetcher = vi.fn(async () => ({
      events: [{ utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 }],
      floodDir: 3, ebbDir: 236,
    }));
    // The metadata lookup must not run when the day feed already carries dirs.
    const dirFetcher = vi.fn(async () => { throw new Error('dir fetch should be skipped'); });
    const cache = new Map<string, any>();
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, dirFetcher);
    expect([a.floodDir, a.ebbDir]).toEqual([3, 236]);
    // Second call is served from the day cache — dirs must survive it.
    const b = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, dirFetcher);
    expect([b.floodDir, b.ebbDir]).toEqual([3, 236]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(dirFetcher).not.toHaveBeenCalled();
  });

  it('fetches CHS set directions from metadata once, then caches them', async () => {
    const fetcher = vi.fn(async () => ({ events: [] }));
    const dirFetcher = vi.fn(async () => ({ floodDir: 95, ebbDir: 275 }));
    const cache = new Map<string, any>();
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, dirFetcher);
    expect([a.floodDir, a.ebbDir]).toEqual([95, 275]);
    const b = await stationData(station, new Date('2026-06-06T10:00:00Z'), 2, cache, fetcher, dirFetcher);
    expect([b.floodDir, b.ebbDir]).toEqual([95, 275]);
    expect(dirFetcher).toHaveBeenCalledTimes(1); // static metadata, cached
  });

  it('leaves dirs undefined when neither the feed nor metadata supplies them', async () => {
    const a = await stationData(station, new Date('2026-06-06T10:00:00Z'), 1,
      new Map<string, any>(), async () => ({ events: [] }), noDirs);
    expect(a.floodDir).toBeUndefined();
    expect(a.ebbDir).toBeUndefined();
  });
});

describe('CHS fetch uses liveId, not the stable stationId', () => {
  const base: StationConfig = {
    provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows', lat: 49.13, lon: -123.81,
  };

  it('passes station.liveId to the CHS events fetcher', async () => {
    const spy = vi.spyOn(chs, 'fetchChsEvents').mockResolvedValue([]);
    vi.spyOn(chs, 'fetchChsDirections').mockResolvedValue({ floodDir: 100, ebbDir: 280 });
    await stationData({ ...base, liveId: 'IWLS123' }, new Date('2026-07-01T00:00:00Z'), 1, new Map());
    expect(spy.mock.calls[0][0]).toBe('IWLS123');
    vi.restoreAllMocks();
  });

  it('throws when a CHS station has no liveId', async () => {
    await expect(
      stationData(base, new Date('2026-07-01T00:00:00Z'), 1, new Map()),
    ).rejects.toThrow(/no live id for Dodd Narrows/);
  });
});
