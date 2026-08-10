import { describe, it, expect } from 'vitest';
import { fetchNoaaEvents } from '../src/sources/noaa';

const sample = { current_predictions: { cp: [
  { Time: '2026-06-06 04:14', Type: 'slack', Velocity_Major: '0.0', meanFloodDir: 3, meanEbbDir: 236 },
  { Time: '2026-06-06 05:40', Type: 'ebb',   Velocity_Major: '-3.2', meanFloodDir: 3, meanEbbDir: 236 },
  { Time: '2026-06-06 06:00', Type: 'foo',   Velocity_Major: '1.0', meanFloodDir: 3, meanEbbDir: 236 },
] } };

const fakeFetch = async () => ({ ok: true, json: async () => sample }) as any;
const day = [new Date('2026-06-06T00:00:00Z'), new Date('2026-06-07T00:00:00Z')] as const;

describe('fetchNoaaEvents', () => {
  it('parses cp rows into CurrentEvents, dropping unknown types', async () => {
    const r = await fetchNoaaEvents('PUG1717', 35, day[0], day[1], fakeFetch);
    expect(r.events.map(e => [e.kind, e.speedKn])).toEqual([['slack', 0], ['ebb', 3.2]]);
    expect(r.events[0].utc).toBe('2026-06-06T04:14:00.000Z'); // gmt parse
  });

  it("extracts the station's measured mean flood/ebb set (°true)", async () => {
    const r = await fetchNoaaEvents('PUG1717', 35, day[0], day[1], fakeFetch);
    expect(r.floodDir).toBe(3);
    expect(r.ebbDir).toBe(236);
  });

  it('leaves dirs undefined when the response lacks them', async () => {
    const bare = { current_predictions: { cp: [
      { Time: '2026-06-06 04:14', Type: 'slack', Velocity_Major: '0.0' },
    ] } };
    const f = async () => ({ ok: true, json: async () => bare }) as any;
    const r = await fetchNoaaEvents('PUG1717', 35, day[0], day[1], f);
    expect(r.floodDir).toBeUndefined();
    expect(r.ebbDir).toBeUndefined();
  });
});

// Regression: the NOAA client formats begin_date/end_date as YMD dates, so an
// exclusive end instant (dayStart + 24h) reads as an INCLUSIVE next day and every
// request pulls two days. Across a multi-day horizon the windows overlap and
// stationData concatenates the overlap into duplicate events — 48 events for a
// 3-day horizon at Boundary Pass, 16 of them duplicated. Observed live 2026-08-10.
describe('fetchNoaaEvents day window', () => {
  it('requests a single UTC day, not the day plus its successor', async () => {
    let url = '';
    const spy = async (u: any) => { url = String(u); return { ok: true, json: async () => sample } as any; };
    await fetchNoaaEvents('PUG1717', 35, day[0], day[1], spy);
    const q = new URL(url).searchParams;
    expect(q.get('begin_date')).toBe('20260606');
    expect(q.get('end_date')).toBe('20260606');
  });
});
