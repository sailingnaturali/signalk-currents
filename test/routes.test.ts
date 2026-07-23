import { describe, it, expect } from 'vitest';
import { currentsPayload, StationSeries } from '../src/routes';
import { StationConfig, CurrentEvent } from '../src/types';

const st: StationConfig = { provider: 'chs', stationId: 'a', label: 'Gillard', lat: 50.39, lon: -125.15, floodDir: 160, ebbDir: 340 };
const ev: CurrentEvent[] = [{ utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 }];

describe('currentsPayload', () => {
  it('shapes the resource: stations with events', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev, source: 'chs', live: true }]]));
    expect(p.stations[0]).toMatchObject({ stationId: 'a', label: 'Gillard', lat: 50.39, lon: -125.15 });
    expect(p.stations[0].events).toEqual(ev);
  });

  it('carries flood/ebb set so consumers can speak direction', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev, source: 'chs', live: true }]]));
    expect(p.stations[0]).toMatchObject({ floodDir: 160, ebbDir: 340 });
  });

  it('states where the dirs came from (api vs config)', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev, dirsSource: 'config', source: 'chs', live: true }]]));
    expect(p.stations[0].dirsSource).toBe('config');
  });

  it('passes per-direction estimated flags through for config dirs', () => {
    const flagged: StationConfig = { ...st, ebbDirEstimated: true };
    const p = currentsPayload(new Map([[st.stationId, { station: flagged, events: ev, dirsSource: 'config', source: 'chs', live: true }]]));
    expect(p.stations[0].ebbDirEstimated).toBe(true);
    expect(p.stations[0].floodDirEstimated).toBeUndefined();
  });

  it('omits estimated flags when dirs are API-measured', () => {
    const flagged: StationConfig = { ...st, ebbDirEstimated: true };
    const p = currentsPayload(new Map([[st.stationId, { station: flagged, events: ev, dirsSource: 'api', source: 'chs', live: true }]]));
    expect(p.stations[0].ebbDirEstimated).toBeUndefined();
  });
});

describe('provenance in /currents payload', () => {
  const base = (over: Partial<StationSeries>): StationSeries => ({
    station: { provider: 'noaa', stationId: 'PUG1701', label: 'Deception Pass', lat: 48.4, lon: -122.6 },
    events: [], dirsSource: 'api', source: 'noaa', live: true, ...over,
  });

  it('labels live NOAA data source/live and not unreliable', () => {
    const p: any = currentsPayload(new Map([['a', base({})]]));
    expect(p.stations[0].source).toBe('noaa');
    expect(p.stations[0].live).toBe(true);
    expect(p.stations[0].unreliableForTransit).toBe(false);
  });

  it('flags a requiresLive station served harmonic-only', () => {
    const s = base({
      station: { provider: 'chs', stationId: 'X', label: 'Seymour Narrows', lat: 50, lon: -125, requiresLive: true },
      source: 'harmonic', live: false,
    });
    const p: any = currentsPayload(new Map([['a', s]]));
    expect(p.stations[0].source).toBe('harmonic');
    expect(p.stations[0].live).toBe(false);
    expect(p.stations[0].unreliableForTransit).toBe(true);
  });

  it('does not flag a non-requiresLive station served harmonic-only', () => {
    const s = base({ source: 'harmonic', live: false });
    const p: any = currentsPayload(new Map([['a', s]]));
    expect(p.stations[0].unreliableForTransit).toBe(false);
  });

  it('marks a derived gate so consumers know it is slack-timing only, no speed vector', () => {
    const s = base({
      station: { provider: 'chs', stationId: 'chs-malibu-rapids', label: 'Malibu Rapids', lat: 50.16, lon: -123.85 },
      events: [{ utc: '2026-03-11T05:30:00.000Z', kind: 'slack', speedKn: 0 }],
      source: 'harmonic', live: false, derived: true,
    });
    const p: any = currentsPayload(new Map([['a', s]]));
    expect(p.stations[0].derived).toBe(true);
    expect(p.stations[0].floodDir).toBeUndefined();
    expect(p.stations[0].ebbDir).toBeUndefined();
  });
});
