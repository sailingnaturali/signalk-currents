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
