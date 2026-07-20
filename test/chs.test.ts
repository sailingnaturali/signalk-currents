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

describe('CHS rate limiting', () => {
  it('retries a 429 and succeeds on the follow-up', async () => {
    // Cold start fetches every configured station back-to-back; CHS 429s the
    // tail of that burst, which silently left those gates with no data.
    let calls = 0;
    const fakeFetch = async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 429 } as any
        : { ok: true, status: 200, json: async () => rows } as any;
    };
    const ev = await fetchChsEvents('abc', new Date('2026-06-06T00:00:00Z'),
      new Date('2026-06-07T00:00:00Z'), fakeFetch);
    expect(calls).toBe(2);
    expect(ev.map(e => e.kind)).toEqual(['slack', 'flood']);
  });

  it('gives up after repeated 429s rather than looping forever', async () => {
    let calls = 0;
    const fakeFetch = async () => { calls += 1; return { ok: false, status: 429 } as any; };
    await expect(fetchChsEvents('abc', new Date('2026-06-06T00:00:00Z'),
      new Date('2026-06-07T00:00:00Z'), fakeFetch)).rejects.toThrow('CHS 429');
    expect(calls).toBe(3);
  });
});

describe('WEAK_AND_VARIABLE qualifier', () => {
  it('treats a weak-and-variable period as slack', async () => {
    // Stations in channels that never cleanly reverse (Johnstone Strait -
    // Central) publish WEAK_AND_VARIABLE instead of SLACK, and may emit no
    // EXTREMA_FLOOD at all. Unmapped, every such event was dropped and the
    // station served no slack windows at all.
    const rows = [
      { eventDate: '2026-07-20T00:43:00Z', qualifier: 'WEAK_AND_VARIABLE', value: 0.0 },
      { eventDate: '2026-07-20T06:41:00Z', qualifier: 'EXTREMA_EBB', value: 1.0 },
    ];
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => rows }) as any;
    const ev = await fetchChsEvents('jsc', new Date('2026-07-20T00:00:00Z'),
      new Date('2026-07-21T00:00:00Z'), fakeFetch);
    expect(ev.map(e => e.kind)).toEqual(['slack', 'ebb']);
    expect(ev[0].speedKn).toBe(0);
  });
});
