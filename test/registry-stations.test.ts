import { describe, it, expect } from 'vitest';
import { registryChsStations } from '../src/registry-stations';

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

  it('flags requiresLive true for every constricted gate; exempts only the open straits', () => {
    const out = registryChsStations(DATA as never);
    const byLabel = Object.fromEntries(out.map((s) => [s.label, s]));
    expect(byLabel['Dodd Narrows'].requiresLive).toBe(true);      // constricted
    expect(byLabel['Porlier Pass'].requiresLive).toBe(true);      // constricted (flips under the new posture)
  });

  it('reads the real bundled registry (guards a silent rename)', async () => {
    const out = registryChsStations();
    expect(out.length).toBeGreaterThanOrEqual(19);
    expect(out.find((s) => s.label === 'Dodd Narrows')?.stationId).toBe('chs-dodd-narrows');
  });

  it('exempts the two open straits from requiresLive; a constricted gate stays flagged', () => {
    const out = registryChsStations();
    const byLabel = Object.fromEntries(out.map((s) => [s.label, s]));
    expect(byLabel['Dodd Narrows'].requiresLive).toBe(true);
    expect(byLabel['Porlier Pass'].requiresLive).toBe(true);
    expect(byLabel['Juan de Fuca - East'].requiresLive).toBeUndefined();
    expect(byLabel['Johnstone Strait - Central'].requiresLive).toBeUndefined();
  });
});
