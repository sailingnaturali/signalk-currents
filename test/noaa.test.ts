import { describe, it, expect } from 'vitest';
import { fetchNoaaEvents } from '../src/sources/noaa';

const sample = { current_predictions: { cp: [
  { Time: '2026-06-06 04:14', Type: 'slack', Velocity_Major: '0.0' },
  { Time: '2026-06-06 05:40', Type: 'ebb',   Velocity_Major: '-3.2' },
  { Time: '2026-06-06 06:00', Type: 'foo',   Velocity_Major: '1.0' },
] } };

describe('fetchNoaaEvents', () => {
  it('parses cp rows into CurrentEvents, dropping unknown types', async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => sample }) as any;
    const ev = await fetchNoaaEvents('PUG1717', 35,
      new Date('2026-06-06T00:00:00Z'), new Date('2026-06-07T00:00:00Z'), fakeFetch);
    expect(ev.map(e => [e.kind, e.speedKn])).toEqual([['slack', 0], ['ebb', 3.2]]);
    expect(ev[0].utc).toBe('2026-06-06T04:14:00.000Z'); // gmt parse
  });
});
