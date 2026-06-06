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
});
