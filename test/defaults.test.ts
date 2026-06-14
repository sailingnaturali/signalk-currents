import { describe, it, expect } from 'vitest';
import { DEFAULT_STATIONS } from '../src/defaults';

describe('DEFAULT_STATIONS', () => {
  it('ships a non-empty default station list', () => {
    expect(DEFAULT_STATIONS.length).toBeGreaterThan(0);
  });

  it('every station has the required fields with valid values', () => {
    for (const s of DEFAULT_STATIONS) {
      expect(['chs', 'noaa']).toContain(s.provider);
      expect(s.stationId).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lon)).toBe(true);
    }
  });

  it('has no duplicate station ids', () => {
    const ids = DEFAULT_STATIONS.map((s) => s.stationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('NOAA stations carry a bin', () => {
    for (const s of DEFAULT_STATIONS.filter((s) => s.provider === 'noaa')) {
      expect(typeof s.noaaBin).toBe('number');
    }
  });

  it('carries no hardcoded set directions (providers supply them at runtime)', () => {
    // Both providers publish authoritative set directions — NOAA inline,
    // CHS in station metadata — so defaults never bake in a flood/ebb value
    // (which could go stale or, worse, be wrong). dirsSource stays 'api'.
    for (const s of DEFAULT_STATIONS) {
      expect(s.floodDir).toBeUndefined();
      expect(s.ebbDir).toBeUndefined();
    }
  });
});
