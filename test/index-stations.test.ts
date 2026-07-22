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
});
