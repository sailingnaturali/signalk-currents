import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { adaptChsBundle, loadHarmonicDb, harmonicStationFor } from '../src/sources/harmonic';

const CHS_BUNDLE = {
  note: 'Contains information licensed under the Canadian Hydrographic Service ... NOT FOR NAVIGATION.',
  stations: [
    {
      id: 'chs-dodd-narrows', name: 'Dodd Narrows', type: 'harmonic',
      floodDirection: 130, ebbDirection: 310, offset: -0.2,
      constituents: [{ name: 'M2', amplitude: 2.1, phase: 45 }, { name: 'K1', amplitude: 0.8, phase: 200 }],
    },
  ],
};

describe('adaptChsBundle', () => {
  it('maps the CHS field names into HarmonicStation, keyed by registry key', () => {
    const out = adaptChsBundle(CHS_BUNDLE);
    expect(out['chs-dodd-narrows']).toEqual({
      floodDir: 130, ebbDir: 310, z0Kn: -0.2,
      constituents: [{ name: 'M2', amplitudeKn: 2.1, phaseDeg: 45 }, { name: 'K1', amplitudeKn: 0.8, phaseDeg: 200 }],
    });
  });
});

describe('loadHarmonicDb merge', () => {
  it('serves both bundled NOAA and data-dir CHS stations by their own keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chsdb-'));
    const chsPath = join(dir, 'chs-constituents.json');
    writeFileSync(chsPath, JSON.stringify(CHS_BUNDLE));
    const db = loadHarmonicDb(undefined, chsPath);
    expect(harmonicStationFor(db, 'chs-dodd-narrows')?.floodDir).toBe(130); // CHS, by registry key
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();                 // bundled NOAA still present
  });

  it('is a no-op for a missing CHS bundle path', () => {
    const db = loadHarmonicDb(undefined, join(tmpdir(), 'does-not-exist.json'));
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();
    expect(harmonicStationFor(db, 'chs-dodd-narrows')).toBeUndefined();
  });
});

describe('adaptChsBundle validation', () => {
  it('throws when a station is missing its constituents', () => {
    const bad = { stations: [{ id: 'chs-x', floodDirection: 100, ebbDirection: 280, offset: 0 }] };
    expect(() => adaptChsBundle(bad)).toThrow(/malformed/);
  });

  it('throws when there is no stations array', () => {
    expect(() => adaptChsBundle({})).toThrow(/no stations array/);
  });

  it('throws on a malformed constituent (non-numeric amplitude)', () => {
    const bad = { stations: [{ id: 'chs-x', floodDirection: 100, ebbDirection: 280, offset: 0, constituents: [{ name: 'M2', amplitude: 'oops', phase: 45 }] }] };
    expect(() => adaptChsBundle(bad)).toThrow(/malformed constituent/);
  });
});

describe('loadHarmonicDb error handling', () => {
  it('surfaces onError for a present-but-corrupt CHS bundle, still serving NOAA-only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chsbad-'));
    const chsPath = join(dir, 'chs-constituents.json');
    writeFileSync(chsPath, '{ this is not valid json');
    const errors: Error[] = [];
    const db = loadHarmonicDb(undefined, chsPath, (e) => errors.push(e));
    expect(errors).toHaveLength(1);                             // corrupt build reported
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();    // NOAA still served
    expect(harmonicStationFor(db, 'chs-dodd-narrows')).toBeUndefined();
  });

  it('does NOT call onError for a missing CHS bundle (a valid NOAA-only state)', () => {
    const errors: Error[] = [];
    const db = loadHarmonicDb(undefined, join(tmpdir(), 'nope-does-not-exist.json'), (e) => errors.push(e));
    expect(errors).toHaveLength(0);
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();
  });
});
