import { describe, it, expect } from 'vitest';
import { fetchChsEvents } from '../src/sources/chs';

const rows = [
  { eventDate: '2026-06-06T04:14:00Z', qualifier: 'SLACK', value: 0 },
  { eventDate: '2026-06-06T05:40:00Z', qualifier: 'EXTREMA_FLOOD', value: 4.1 },
  { eventDate: '2026-06-06T06:00:00Z', qualifier: 'OTHER', value: 1 },
];

describe('fetchChsEvents', () => {
  it('maps qualifiers to kinds, drops unknowns', async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => rows }) as any;
    const ev = await fetchChsEvents('abc', new Date('2026-06-06T00:00:00Z'),
      new Date('2026-06-07T00:00:00Z'), fakeFetch);
    expect(ev.map(e => [e.kind, e.speedKn])).toEqual([['slack', 0], ['flood', 4.1]]);
  });
});
