import { describe, it, expect } from 'vitest';
import { dirsSource, eventFromParts, resolveStation, CurrentEvent, StationConfig } from '../src/types';

describe('CurrentEvent', () => {
  it('normalizes a slack event', () => {
    const e: CurrentEvent = eventFromParts('2026-06-06T04:14:00Z', 'slack', 0);
    expect(e.kind).toBe('slack');
    expect(e.speedKn).toBe(0);
    expect(e.utc).toBe('2026-06-06T04:14:00.000Z'); // canonical ISO
  });
  it('keeps speed magnitude positive', () => {
    expect(eventFromParts('2026-06-06T05:40:00Z', 'ebb', -3.2).speedKn).toBe(3.2);
  });
});

describe('resolveStation', () => {
  const st: StationConfig = { provider: 'noaa', stationId: 'PUG1717', label: 'Boundary Pass',
    lat: 48.69, lon: -123.25, floodDir: 110, ebbDir: 290 };

  it('prefers fetched (measured) dirs over config', () => {
    const r = resolveStation(st, { floodDir: 3, ebbDir: 236 });
    expect([r.floodDir, r.ebbDir]).toEqual([3, 236]);
    expect(r.label).toBe('Boundary Pass'); // rest of the config untouched
  });

  it('falls back to config when the fetch supplied none', () => {
    const r = resolveStation(st, {});
    expect([r.floodDir, r.ebbDir]).toEqual([110, 290]);
  });
});

describe('dirsSource', () => {
  const st: StationConfig = { provider: 'noaa', stationId: 'x', label: 'X',
    lat: 0, lon: 0, floodDir: 110, ebbDir: 290 };

  it("is 'api' when the provider measured the dirs", () => {
    expect(dirsSource(st, { floodDir: 3, ebbDir: 236 })).toBe('api');
  });

  it("is 'config' when only config supplies them", () => {
    expect(dirsSource(st, {})).toBe('config');
  });

  it('is undefined when nobody knows', () => {
    const bare: StationConfig = { ...st, floodDir: undefined, ebbDir: undefined };
    expect(dirsSource(bare, {})).toBeUndefined();
  });
});
