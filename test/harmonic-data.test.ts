import { describe, it, expect } from 'vitest';
import db from '../data/harmonic-constituents.json';

const EXPECTED_STATIONS = [
  'PUG1701', 'PUG1702', 'PUG1616', 'PUG1703',
  'PUG1718', 'PUG1724', 'PUG1734', 'PUG1735', 'PUG1717',
];
const NEAPS_KNOWN = new Set([
  'M2','S2','N2','K2','K1','O1','P1','Q1','M4','M6','MS4','MN4','2N2','MU2','NU2','L2','T2','J1','M1','OO1','RHO','MM','SSA','SA','MSF','MF','LAM2','2MK3','M3','MK3','S4','S6','M8','2SM2','M2','SK3','2Q1',
]);

describe('bundled harmonic constituent data', () => {
  it('has a generated timestamp and NOAA public-domain provenance', () => {
    expect(typeof db.generated).toBe('string');
    expect(db.source.toLowerCase()).toContain('noaa');
  });

  it('covers every expected US-Salish station with usable constituents', () => {
    for (const id of EXPECTED_STATIONS) {
      const s = (db.stations as Record<string, any>)[id];
      expect(s, `missing station ${id}`).toBeTruthy();
      expect(Number.isFinite(s.z0Kn), `missing z0Kn (mean flow) @ ${id}`).toBe(true);
      expect(Number.isFinite(s.floodDir)).toBe(true);
      expect(Number.isFinite(s.ebbDir)).toBe(true);
      expect(s.constituents.length).toBeGreaterThanOrEqual(4);
      for (const c of s.constituents) {
        expect(typeof c.name).toBe('string');
        expect(NEAPS_KNOWN.has(c.name), `unknown constituent ${c.name} @ ${id}`).toBe(true);
        expect(Number.isFinite(c.amplitudeKn)).toBe(true);
        expect(c.amplitudeKn).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(c.phaseDeg)).toBe(true);
      }
    }
  });
});
