import { readFileSync } from 'fs';
import { join } from 'path';

export interface HarmonicConstituentEntry { name: string; amplitudeKn: number; phaseDeg: number; }
export interface HarmonicStation { bin: number; floodDir: number; ebbDir: number; constituents: HarmonicConstituentEntry[]; }
export interface HarmonicDb { generated: string; source: string; stations: Record<string, HarmonicStation>; }

let cached: HarmonicDb | undefined;

// Loads the bundled NOAA constituent DB. dist/ sits one level below the repo
// root alongside data/, and so does src/ during tests — resolve relative to
// the repo root (two up from this file's dir) with a fallback for both layouts.
export function loadHarmonicDb(file?: string): HarmonicDb {
  if (!file && cached) return cached;
  const path = file ?? join(__dirname, '..', '..', 'data', 'harmonic-constituents.json');
  const db = JSON.parse(readFileSync(path, 'utf8')) as HarmonicDb;
  if (!file) cached = db;
  return db;
}

export function harmonicStationFor(db: HarmonicDb, stationId: string): HarmonicStation | undefined {
  return db.stations[stationId];
}
