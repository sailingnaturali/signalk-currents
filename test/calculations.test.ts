import { describe, it, expect } from 'vitest';
import { nearestStation } from '../src/calculations';
import { StationConfig } from '../src/types';

const stations: StationConfig[] = [
  { provider: 'chs', stationId: 'a', label: 'Gillard', lat: 50.39, lon: -125.15, floodDir: 160, ebbDir: 340 },
  { provider: 'noaa', stationId: 'b', label: 'Boundary', lat: 48.69, lon: -123.24, floodDir: 110, ebbDir: 290 },
];

describe('nearestStation', () => {
  it('returns the closest configured station to a position', () => {
    expect(nearestStation(48.76, -123.05, stations)!.label).toBe('Boundary');
    expect(nearestStation(50.4, -125.2, stations)!.label).toBe('Gillard');
  });
  it('returns undefined for an empty list', () => {
    expect(nearestStation(0, 0, [])).toBeUndefined();
  });
});
