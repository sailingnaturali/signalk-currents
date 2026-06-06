import { describe, it, expect } from 'vitest';
import { currentsPayload } from '../src/routes';
import { StationConfig, CurrentEvent } from '../src/types';

const st: StationConfig = { provider: 'chs', stationId: 'a', label: 'Gillard', lat: 50.39, lon: -125.15, floodDir: 160, ebbDir: 340 };
const ev: CurrentEvent[] = [{ utc: '2026-06-06T04:14:00.000Z', kind: 'slack', speedKn: 0 }];

describe('currentsPayload', () => {
  it('shapes the resource: stations with events', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev }]]));
    expect(p.stations[0]).toMatchObject({ stationId: 'a', label: 'Gillard', lat: 50.39, lon: -125.15 });
    expect(p.stations[0].events).toEqual(ev);
  });

  it('carries flood/ebb set so consumers can speak direction', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev }]]));
    expect(p.stations[0]).toMatchObject({ floodDir: 160, ebbDir: 340 });
  });

  it('states where the dirs came from (api vs config)', () => {
    const p = currentsPayload(new Map([[st.stationId, { station: st, events: ev, dirsSource: 'config' }]]));
    expect(p.stations[0].dirsSource).toBe('config');
  });

  it('passes per-direction estimated flags through for config dirs', () => {
    const flagged: StationConfig = { ...st, ebbDirEstimated: true };
    const p = currentsPayload(new Map([[st.stationId, { station: flagged, events: ev, dirsSource: 'config' }]]));
    expect(p.stations[0].ebbDirEstimated).toBe(true);
    expect(p.stations[0].floodDirEstimated).toBeUndefined();
  });

  it('omits estimated flags when dirs are API-measured', () => {
    const flagged: StationConfig = { ...st, ebbDirEstimated: true };
    const p = currentsPayload(new Map([[st.stationId, { station: flagged, events: ev, dirsSource: 'api' }]]));
    expect(p.stations[0].ebbDirEstimated).toBeUndefined();
  });
});
