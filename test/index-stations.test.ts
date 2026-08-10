import { describe, it, expect } from 'vitest';
import { effectiveStations } from '../src/registry-stations';
import { StationConfig } from '../src/types';

const NOAA: StationConfig = { provider: 'noaa', stationId: 'PUG1717', noaaBin: 35, label: 'Boundary Pass', lat: 48.69, lon: -123.24 };

describe('effectiveStations', () => {
  it('merges the NOAA config default with the registry CHS gates', () => {
    const out = effectiveStations([NOAA]);
    expect(out.some((s) => s.stationId === 'PUG1717')).toBe(true);
    expect(out.some((s) => s.provider === 'chs' && s.stationId === 'chs-dodd-narrows')).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(20);
  });

  it('dedupes by stationId (a config override wins over the registry entry)', () => {
    const override: StationConfig = { provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows (mine)', lat: 49.1, lon: -123.8 };
    const out = effectiveStations([NOAA, override]);
    const dodd = out.filter((s) => s.stationId === 'chs-dodd-narrows');
    expect(dodd).toHaveLength(1);
    expect(dodd[0].label).toBe('Dodd Narrows (mine)');
  });

  it('includeChs=false skips the registry CHS gates entirely (non-BC operator)', () => {
    const out = effectiveStations([NOAA], false);
    expect(out).toEqual([NOAA]);
    expect(out.some((s) => s.provider === 'chs')).toBe(false);
  });

  // Regression: a config written before station-corrections 2.0.0 still carries the
  // provider-minted CHS id (a UUID). That does not collide with the registry's slug,
  // so the same gate was served TWICE — 19 duplicated gates on the boat Pi, observed
  // 2026-08-10 — and the stale UUID resolves no live id either. Same gate, one entry:
  // the registry key is what resolveLiveIds works from, so it supplies identity while
  // the operator's own set directions survive.
  it('collapses a config entry that names a registry gate under a stale id', () => {
    const stale: StationConfig = {
      provider: 'chs', stationId: '63aef1866a2b9417c035030f', label: 'Dodd Narrows',
      lat: 49.13, lon: -123.81, floodDir: 355, ebbDir: 155,
    };
    const out = effectiveStations([NOAA, stale]);
    const dodd = out.filter((s) => s.label === 'Dodd Narrows');
    expect(dodd).toHaveLength(1);
    expect(dodd[0].stationId).toBe('chs-dodd-narrows');
    expect(dodd[0].floodDir).toBe(355);
  });
});
