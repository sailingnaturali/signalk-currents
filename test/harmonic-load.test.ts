import { describe, it, expect } from 'vitest';
import { loadHarmonicDb, harmonicStationFor } from '../src/sources/harmonic';

describe('harmonic DB loader', () => {
  it('loads the bundled DB and finds a station by id', () => {
    const db = loadHarmonicDb();
    expect(db.stations).toBeTruthy();
    const s = harmonicStationFor(db, 'PUG1701');
    expect(s).toBeTruthy();
    expect(s!.constituents.length).toBeGreaterThan(0);
    expect(harmonicStationFor(db, 'NOPE')).toBeUndefined();
  });
});
