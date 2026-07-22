import { describe, it, expect } from 'vitest';
import { DEFAULT_STATIONS } from '../src/defaults';

describe('DEFAULT_STATIONS', () => {
  it('ships only NOAA — no committed CHS station data (licence invariant)', () => {
    expect(DEFAULT_STATIONS.length).toBe(1);
    expect(DEFAULT_STATIONS.every((s) => s.provider === 'noaa')).toBe(true);
  });

  it('carries no CHS-shaped station ids', () => {
    // CHS ids are 24-hex Mongo ids; none may be committed.
    for (const s of DEFAULT_STATIONS) {
      expect(/^[0-9a-f]{24}$/.test(s.stationId)).toBe(false);
    }
  });

  it('the NOAA station carries a bin and no baked-in set directions', () => {
    const noaa = DEFAULT_STATIONS[0];
    expect(typeof noaa.noaaBin).toBe('number');
    expect(noaa.floodDir).toBeUndefined();
    expect(noaa.ebbDir).toBeUndefined();
  });
});
