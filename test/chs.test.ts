import { describe, it, expect } from 'vitest';
import { fetchChsEvents, fetchChsDirections } from '../src/sources/chs';

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

  it('URL-encodes the station id so it cannot reshape the request path', async () => {
    let calledUrl = '';
    const fakeFetch = async (u: string) => {
      calledUrl = u;
      return { ok: true, json: async () => [] } as any;
    };
    await fetchChsEvents('../evil?x=', new Date('2026-06-06T00:00:00Z'),
      new Date('2026-06-07T00:00:00Z'), fakeFetch);
    expect(calledUrl).toContain('/stations/..%2Fevil%3Fx%3D/data');
  });
});

describe('fetchChsDirections', () => {
  it('reads floodDirection/ebbDirection from station metadata', async () => {
    const fakeFetch = async () =>
      ({ ok: true, json: async () => ({ floodDirection: 95, ebbDirection: 275 }) }) as any;
    expect(await fetchChsDirections('g', fakeFetch)).toEqual({ floodDir: 95, ebbDir: 275 });
  });

  it('keeps a 0° direction (due north), not undefined', async () => {
    // Seymour Narrows ebbs 0° — a real value the finite check must preserve.
    const fakeFetch = async () =>
      ({ ok: true, json: async () => ({ floodDirection: 180, ebbDirection: 0 }) }) as any;
    expect(await fetchChsDirections('s', fakeFetch)).toEqual({ floodDir: 180, ebbDir: 0 });
  });

  it('returns undefined dirs when metadata omits them', async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => ({}) }) as any;
    expect(await fetchChsDirections('x', fakeFetch)).toEqual({ floodDir: undefined, ebbDir: undefined });
  });

  it('hits the metadata endpoint with an encoded station id', async () => {
    let url = '';
    const fakeFetch = async (u: string) => { url = u; return { ok: true, json: async () => ({}) } as any; };
    await fetchChsDirections('../evil', fakeFetch);
    expect(url).toContain('/stations/..%2Fevil/metadata');
  });
});
