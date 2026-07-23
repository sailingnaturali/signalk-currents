import { readFileSync } from 'fs';
import { join } from 'path';
import { createTidePredictor } from '@neaps/tide-predictor';
import { CurrentEvent, eventFromParts, StationDirs } from '../types';

export interface HarmonicConstituentEntry { name: string; amplitudeKn: number; phaseDeg: number; }
// z0Kn is NOAA's majorMeanSpeed — the station's net mean flow along the major axis.
// Salish passes run −0.74..+0.30 kn of it; dropping it drifts slack timing badly.
export interface HarmonicStation { floodDir: number; ebbDir: number; z0Kn?: number; constituents: HarmonicConstituentEntry[]; }
// A reference tide port: a water-level harmonic fit (metres). No flood/ebb axis —
// a tide has none. Consumed only to predict HW/LW for a derived gate.
export interface TideStation { z0M: number; constituents: HarmonicConstituentEntry[]; }
// A derived gate (Malibu Rapids): no current station of its own. Slack is the
// reference tide port's HW/LW shifted by a fixed lag; no speed is ever known.
export interface DerivedGate { reference: string; hwLagMinutes: number; lwLagMinutes: number; }
export interface HarmonicDb {
  generated: string; source: string;
  stations: Record<string, HarmonicStation>;
  tides?: Record<string, TideStation>;
  derived?: Record<string, DerivedGate>;
}

let cached: HarmonicDb | undefined;

export interface AdaptedChs {
  stations: Record<string, HarmonicStation>;
  tides: Record<string, TideStation>;
  derived: Record<string, DerivedGate>;
}

function adaptConstituents(id: string, raw: unknown): HarmonicConstituentEntry[] {
  if (!Array.isArray(raw)) throw new Error(`CHS bundle station ${JSON.stringify(id)} is malformed`);
  return raw.map((c) => {
    if (typeof c?.name !== 'string' || typeof c?.amplitude !== 'number' || typeof c?.phase !== 'number') {
      throw new Error(`CHS bundle station ${id} has a malformed constituent`);
    }
    return { name: c.name, amplitudeKn: c.amplitude, phaseDeg: c.phase };
  });
}

// Adapt a chs-constituents bundle (built locally by the operator) into the plugin's
// shapes, keyed by each station's registry key (its `id`). Three record types:
//   - "harmonic" (or legacy untyped) → a current: floodDirection→floodDir,
//     offset→z0Kn (mean flow), amplitude→amplitudeKn, phase→phaseDeg;
//   - "tide-harmonic" → a reference water-level port (no flood/ebb axis);
//   - "derived-slack" → a gate: reference + HW/LW lags, no constituents, no speed.
export function adaptChsBundle(bundle: unknown): AdaptedChs {
  const stations = (bundle as { stations?: unknown }).stations;
  if (!Array.isArray(stations)) {
    throw new Error('CHS bundle has no stations array');
  }
  const out: AdaptedChs = { stations: {}, tides: {}, derived: {} };
  for (const s of stations as Record<string, unknown>[]) {
    if (typeof s?.id !== 'string') {
      throw new Error(`CHS bundle station ${JSON.stringify(s?.id)} is malformed`);
    }
    const id = s.id;
    if (s.type === 'derived-slack') {
      if (typeof s.reference !== 'string' || typeof s.hwLagMinutes !== 'number' || typeof s.lwLagMinutes !== 'number') {
        throw new Error(`CHS bundle derived gate ${id} is malformed`);
      }
      out.derived[id] = { reference: s.reference, hwLagMinutes: s.hwLagMinutes, lwLagMinutes: s.lwLagMinutes };
      continue;
    }
    if (s.type === 'tide-harmonic') {
      if (typeof s.offset !== 'number') throw new Error(`CHS bundle tide ${id} is malformed`);
      out.tides[id] = { z0M: s.offset, constituents: adaptConstituents(id, s.constituents) };
      continue;
    }
    if (typeof s.floodDirection !== 'number' || typeof s.ebbDirection !== 'number' || typeof s.offset !== 'number') {
      throw new Error(`CHS bundle station ${JSON.stringify(id)} is malformed`);
    }
    out.stations[id] = {
      floodDir: s.floodDirection,
      ebbDir: s.ebbDirection,
      z0Kn: s.offset,
      constituents: adaptConstituents(id, s.constituents),
    };
  }
  return out;
}

// Loads the bundled NOAA constituent DB. dist/ sits one level below the repo
// root alongside data/, and so does src/ during tests — resolve relative to
// the repo root (two up from this file's dir) with a fallback for both layouts.
// When chsBundlePath is given and readable, merges a locally-built CHS bundle
// (from the data dir) in, keyed by registry key. A missing/unreadable CHS
// bundle is a no-op — NOAA-only is a valid state (the operator hasn't built one yet).
export function loadHarmonicDb(
  file?: string,
  chsBundlePath?: string,
  onError?: (e: Error) => void,
): HarmonicDb {
  if (!file && !chsBundlePath && cached) return cached;
  const path = file ?? join(__dirname, '..', '..', 'data', 'harmonic-constituents.json');
  const db = JSON.parse(readFileSync(path, 'utf8')) as HarmonicDb;

  if (chsBundlePath) {
    try {
      const chs = adaptChsBundle(JSON.parse(readFileSync(chsBundlePath, 'utf8')));
      db.stations = { ...db.stations, ...chs.stations };
      db.tides = { ...(db.tides ?? {}), ...chs.tides };
      db.derived = { ...(db.derived ?? {}), ...chs.derived };
    } catch (e) {
      // A missing file is a valid NOAA-only state — the operator hasn't built a
      // CHS bundle yet. But a file that exists and won't parse/validate is a
      // corrupt build: degrade to NOAA-only, but surface it so the operator isn't
      // left silently thinking their 30-minute build worked.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        onError?.(e as Error);
      }
    }
  }

  if (!file && !chsBundlePath) cached = db;
  return db;
}

export function harmonicStationFor(db: HarmonicDb, stationId: string): HarmonicStation | undefined {
  return db.stations[stationId];
}

export function derivedGateFor(db: HarmonicDb, gateId: string): DerivedGate | undefined {
  return db.derived?.[gateId];
}

export function tideStationFor(db: HarmonicDb, tideId: string): TideStation | undefined {
  return db.tides?.[tideId];
}

export interface DerivedDayData { events: CurrentEvent[]; }

// Derive a gate's slack from its reference tide port: predict the port's HW/LW
// and shift each by its lag (HW→hwLag, LW→lwLag). Slack TIMING only — a derived
// gate has NO speed, so every event is a zero-speed 'slack' and there are no
// flood/ebb peaks. Never publish this as environment.current (a speed vector).
export function synthesizeDerivedEvents(gate: DerivedGate, tide: TideStation, start: Date, end: Date): CurrentEvent[] {
  const predictor = createTidePredictor(
    tide.constituents.map((c) => ({ name: c.name, amplitude: c.amplitudeKn, phase: c.phaseDeg })),
    { offset: tide.z0M },
  );
  return predictor
    .getExtremesPrediction({ start, end })
    .map((x) => {
      const lagMs = (x.high ? gate.hwLagMinutes : gate.lwLagMinutes) * 60_000;
      return eventFromParts(new Date(x.time.getTime() + lagMs).toISOString(), 'slack', 0);
    })
    .sort((a, b) => a.utc.localeCompare(b.utc));
}

// Whole-horizon derive, aligned to UTC-day boundaries like synthesizeHorizon. Pads
// the extremes window so a HW/LW just outside whose shifted slack lands inside is
// still emitted, then clips to the horizon.
export function synthesizeDerivedHorizon(gate: DerivedGate, tide: TideStation, start: Date, horizonDays: number): DerivedDayData {
  const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = new Date(base.getTime() + horizonDays * 86400000);
  const pad = Math.max(gate.hwLagMinutes, gate.lwLagMinutes) * 60_000 + 3600_000;
  const events = synthesizeDerivedEvents(gate, tide, new Date(base.getTime() - pad), new Date(end.getTime() + pad))
    .filter((e) => {
      const t = new Date(e.utc).getTime();
      return t >= base.getTime() && t <= end.getTime();
    });
  return { events };
}

// Synthesize the major-axis signed velocity from bundled constituents and reduce
// it to slack/flood/ebb events — the same shape the live CHS/NOAA sources emit.
// Positive level = flood (along floodDir); negative = ebb. Slack = zero crossing.
export function synthesizeEvents(hs: HarmonicStation, start: Date, end: Date): CurrentEvent[] {
  // `offset` is injected as a Z0 constituent, shifting the whole curve by the
  // station's mean flow — this is what aligns slack (the zero crossing) with NOAA.
  const predictor = createTidePredictor(
    hs.constituents.map((c) => ({ name: c.name, amplitude: c.amplitudeKn, phase: c.phaseDeg })),
    { offset: hs.z0Kn ?? 0 },
  );

  // Flood/ebb peaks come straight from the extremes predictor. Label by the SIGN of
  // the velocity, not the extremum's high/low: with Z0 applied a relaxation peak that
  // never reverses stays flood/ebb per its sign (matches NOAA's max_slack labeling).
  const extremes = predictor.getExtremesPrediction({ start, end });
  const events: CurrentEvent[] = extremes.map((x) =>
    eventFromParts(x.time.toISOString(), x.level >= 0 ? 'flood' : 'ebb', Math.abs(x.level)),
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
