import { describe, it, expect } from 'vitest';
import { currentStations, normalizeName, resolveLiveIds } from '../src/sources/iwls-index';

const RAW = [
  { id: 'wl1', officialName: 'Tasiujaq', latitude: 58.7, longitude: -69.8, timeSeries: [{ code: 'wlo' }] },
  { id: 'cur1', officialName: 'Dodd Narrows', latitude: 49.13, longitude: -123.81, timeSeries: [{ code: 'wcsp1' }, { code: 'wcdp1' }] },
  { id: 'cur2', officialName: 'JUAN DE FUCA - EAST', latitude: 48.23, longitude: -123.53, timeSeries: [{ code: 'wcsp1' }] },
];

describe('currentStations', () => {
  it('keeps only wcsp1 publishers', () => {
    expect(currentStations(RAW as never).map((s) => s.id)).toEqual(['cur1', 'cur2']);
  });
  it('survives a missing timeSeries array', () => {
    expect(currentStations([{ id: 'x', officialName: 'X', latitude: 0, longitude: 0 }] as never)).toEqual([]);
  });
});

describe('normalizeName', () => {
  it('folds case, punctuation and spacing', () => {
    expect(normalizeName('JUAN DE FUCA - EAST')).toBe('juan de fuca east');
    expect(normalizeName('Dodd Narrows')).toBe('dodd narrows');
  });
});

describe('resolveLiveIds', () => {
  it('maps normalized name -> live id for current stations only', async () => {
    const fetchFn = (async () => ({ ok: true, json: async () => RAW })) as unknown as typeof fetch;
    const map = await resolveLiveIds(fetchFn);
    expect(map.get('dodd narrows')).toBe('cur1');
    expect(map.get('juan de fuca east')).toBe('cur2');
    expect(map.has('tasiujaq')).toBe(false);
  });
  it('throws on a non-ok response', async () => {
    const fetchFn = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(resolveLiveIds(fetchFn)).rejects.toThrow(/IWLS 503/);
  });
});
