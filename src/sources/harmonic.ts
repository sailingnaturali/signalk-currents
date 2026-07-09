import { readFileSync } from 'fs';
import { join } from 'path';
import { createTidePredictor } from '@neaps/tide-predictor';
import { CurrentEvent, eventFromParts, StationDirs } from '../types';

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

// Synthesize the major-axis signed velocity from bundled constituents and reduce
// it to slack/flood/ebb events — the same shape the live CHS/NOAA sources emit.
// Positive level = flood (along floodDir); negative = ebb. Slack = zero crossing.
export function synthesizeEvents(hs: HarmonicStation, start: Date, end: Date): CurrentEvent[] {
  const predictor = createTidePredictor(
    hs.constituents.map((c) => ({ name: c.name, amplitude: c.amplitudeKn, phase: c.phaseDeg })),
  );

  // Flood/ebb peaks come straight from the extremes predictor.
  const extremes = predictor.getExtremesPrediction({ start, end });
  const events: CurrentEvent[] = extremes.map((x) =>
    eventFromParts(x.time.toISOString(), x.high ? 'flood' : 'ebb', Math.abs(x.level)),
  );

  // Slack = sign change on a 1-minute timeline; linear-interpolate the crossing.
  const line = predictor.getTimelinePrediction({ start, end, timeFidelity: 60 });
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((a.level <= 0 && b.level > 0) || (a.level >= 0 && b.level < 0)) {
      const frac = a.level === b.level ? 0 : a.level / (a.level - b.level);
      const t = a.time.getTime() + frac * (b.time.getTime() - a.time.getTime());
      events.push(eventFromParts(new Date(t).toISOString(), 'slack', 0));
    }
  }

  events.sort((x, y) => x.utc.localeCompare(y.utc));
  return events;
}

export interface HarmonicDayData extends StationDirs { events: CurrentEvent[]; }

// Synthesize the whole horizon in one pass, aligned to UTC-day boundaries so the
// event window matches the live path (fetch.ts iterates UTC days from the same start).
export function synthesizeHorizon(hs: HarmonicStation, start: Date, horizonDays: number): HarmonicDayData {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = new Date(base.getTime() + horizonDays * 86400000);
  return { events: synthesizeEvents(hs, base, end), floodDir: hs.floodDir, ebbDir: hs.ebbDir };
}
