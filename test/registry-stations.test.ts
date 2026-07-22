import { describe, it, expect } from 'vitest';
import { registryChsStations, STRONG_GATES } from '../src/registry-stations';

const DATA = {
  'chs-dodd-narrows': { name: 'Dodd Narrows', position: [49.13, -123.81], provider: 'chs' },
  'chs-porlier-pass': { name: 'Porlier Pass', position: [49.01, -123.58], provider: 'chs' },
  'noaa-boundary-pass': { name: 'Boundary Pass', position: [48.69, -123.24], provider: 'noaa' },
};

describe('registryChsStations', () => {
  it('emits a StationConfig per CHS gate, keyed by the registry key, NOAA excluded', () => {
    const out = registryChsStations(DATA as never);
    expect(out.map((s) => s.stationId)).toEqual(['chs-dodd-narrows', 'chs-porlier-pass']);
    const dodd = out[0];
    expect(dodd).toMatchObject({ provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows', lat: 49.13, lon: -123.81 });
    expect(dodd.floodDir).toBeUndefined();
    expect(dodd.ebbDir).toBeUndefined();
  });

  it('flags requiresLive from STRONG_GATES by label', () => {
    const out = registryChsStations(DATA as never);
    const byLabel = Object.fromEntries(out.map((s) => [s.label, s]));
    expect(byLabel['Dodd Narrows'].requiresLive).toBe(true);   // strong
    expect(byLabel['Porlier Pass'].requiresLive).toBeUndefined(); // not strong
  });

  it('STRONG_GATES covers the known narrows', () => {
    for (const g of ['Seymour Narrows', 'Dent Rapids', 'Gillard Passage', 'Dodd Narrows', 'Active Pass']) {
      expect(STRONG_GATES.has(g)).toBe(true);
    }
  });

  it('reads the real bundled registry (guards a silent rename)', async () => {
    const out = registryChsStations();
    expect(out.length).toBeGreaterThanOrEqual(19);
    expect(out.find((s) => s.label === 'Dodd Narrows')?.stationId).toBe('chs-dodd-narrows');
  });
});
