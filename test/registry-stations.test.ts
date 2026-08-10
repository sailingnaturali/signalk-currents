import { describe, it, expect } from 'vitest';
import { registryChsStations, registryDerivedGates } from '../src/registry-stations';

const DATA = {
  'chs-dodd-narrows': { name: 'Dodd Narrows', position: [49.13, -123.81], provider: 'chs' },
  'chs-porlier-pass': { name: 'Porlier Pass', position: [49.01, -123.58], provider: 'chs' },
  'noaa-boundary-pass': { name: 'Boundary Pass', position: [48.69, -123.24], provider: 'noaa' },
  // A tide reference port. Same provider, same registry — but it publishes no
  // current series, so it is not a gate.
  'chs-victoria': { name: 'Victoria', position: [48.424, -123.371], provider: 'chs', kind: 'tide' },
  // A derived gate: CHS publishes no current station, so there's nothing to fetch or fit.
  'chs-malibu-rapids': {
    name: 'Malibu Rapids', position: [50.16, -123.85], provider: 'chs',
    kind: 'current', derived: { reference: 'chs-point-atkinson', hwLagMinutes: 25, lwLagMinutes: 35 },
  },
};

describe('registryDerivedGates', () => {
  it('emits a config per derived gate, carrying its reference port and lags', () => {
    expect(registryDerivedGates(DATA as never)).toEqual([
      {
        stationId: 'chs-malibu-rapids', label: 'Malibu Rapids', lat: 50.16, lon: -123.85,
        reference: 'chs-point-atkinson', hwLagMinutes: 25, lwLagMinutes: 35,
      },
    ]);
  });

  it('is empty when no gate is derived', () => {
    expect(registryDerivedGates({ 'chs-dodd-narrows': DATA['chs-dodd-narrows'] } as never)).toEqual([]);
  });
});

describe('registryChsStations', () => {
  it('emits a StationConfig per CHS gate, keyed by the registry key, NOAA and derived gates excluded', () => {
    const out = registryChsStations(DATA as never);
    // Malibu Rapids is derived (no CHS current station) — excluded until we serve it (Phase 2).
    expect(out.map((s) => s.stationId)).toEqual(['chs-dodd-narrows', 'chs-porlier-pass']);
    const dodd = out[0];
    expect(dodd).toMatchObject({ provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows', lat: 49.13, lon: -123.81 });
    expect(dodd.floodDir).toBeUndefined();
    expect(dodd.ebbDir).toBeUndefined();
  });

  // Regression: station-corrections 2.3.0 started carrying tide reference ports
  // (kind: 'tide') alongside the gates. This filter predates that field, so all ten
  // were served up as current stations, resolved no live id — they publish no wcsp1
  // series — and threw "no live id for <port>" on every poll cycle on the boat Pi.
  // Absent kind means current: the registry was currents-only first.
  it('skips tide reference ports — they are not current gates', () => {
    const out = registryChsStations(DATA as never);
    expect(out.find((s) => s.label === 'Victoria')).toBeUndefined();
  });

  // The filter is an allowlist for exactly this reason: the bug above WAS the
  // registry growing a kind this repo had never seen. A `!== 'tide'` denylist
  // re-acquires it the next time that happens.
  it('skips a kind it has never seen, rather than assuming it is a gate', () => {
    const future = { 'chs-somewhere': { name: 'Somewhere', position: [49, -123], provider: 'chs', kind: 'wave' } };
    expect(registryChsStations(future as never)).toEqual([]);
  });

  it('flags requiresLive true for every constricted gate; exempts only the open straits', () => {
    const out = registryChsStations(DATA as never);
    const byLabel = Object.fromEntries(out.map((s) => [s.label, s]));
    expect(byLabel['Dodd Narrows'].requiresLive).toBe(true);      // constricted
    expect(byLabel['Porlier Pass'].requiresLive).toBe(true);      // constricted (flips under the new posture)
  });

  it('reads the real bundled registry (guards a silent rename), and skips the derived Malibu gate', async () => {
    const out = registryChsStations();
    expect(out.length).toBeGreaterThanOrEqual(19);
    expect(out.find((s) => s.label === 'Dodd Narrows')?.stationId).toBe('chs-dodd-narrows');
    expect(out.find((s) => s.stationId === 'chs-malibu-rapids')).toBeUndefined();
    // The shape of this bug: the registry grows entries that are not gates.
    expect(out.filter((s) => s.stationId.startsWith('chs-'))
      .find((s) => s.label === 'Victoria')).toBeUndefined();
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
