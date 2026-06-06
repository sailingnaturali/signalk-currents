import { describe, it, expect } from 'vitest';
import { interpolateCurrent } from '../src/calculations';
import { CurrentEvent, StationConfig } from '../src/types';

const st: StationConfig = { provider: 'chs', stationId: 'a', label: 'G', lat: 0, lon: 0, floodDir: 160, ebbDir: 340 };
const events: CurrentEvent[] = [
  { utc: '2026-06-06T04:00:00.000Z', kind: 'slack', speedKn: 0 },
  { utc: '2026-06-06T06:00:00.000Z', kind: 'flood', speedKn: 4 }, // max flood
  { utc: '2026-06-06T08:00:00.000Z', kind: 'slack', speedKn: 0 },
];
const KN = 0.514444;

describe('interpolateCurrent', () => {
  it('is ~0 at slack', () => {
    const c = interpolateCurrent(new Date('2026-06-06T04:00:00Z'), events, st)!;
    expect(c.drift).toBeCloseTo(0, 5);
  });
  it('is max at the flood extremum, set = floodDir(rad)', () => {
    const c = interpolateCurrent(new Date('2026-06-06T06:00:00Z'), events, st)!;
    expect(c.drift).toBeCloseTo(4 * KN, 4);
    expect(c.setTrue).toBeCloseTo(160 * Math.PI / 180, 6);
  });
  it('ramps up sinusoidally halfway slack→flood', () => {
    const c = interpolateCurrent(new Date('2026-06-06T05:00:00Z'), events, st)!;
    expect(c.drift).toBeCloseTo(4 * Math.sin(Math.PI / 4) * KN, 4); // sin(45°)
  });
  it('returns undefined outside the event span', () => {
    expect(interpolateCurrent(new Date('2026-06-06T03:00:00Z'), events, st)).toBeUndefined();
  });
  it('returns undefined when the needed set direction is unknown', () => {
    // Dirs are optional (NOAA fills them from the API); without one we cannot
    // honestly publish a setTrue, so publish nothing.
    const noDirs: StationConfig = { ...st, floodDir: undefined, ebbDir: undefined };
    expect(interpolateCurrent(new Date('2026-06-06T06:00:00Z'), events, noDirs)).toBeUndefined();
  });
});
