// Regenerates data/harmonic-constituents.json from the slackwater-engine currents
// bundle — itself generated from NOAA CO-OPS public-domain harcon metadata at each
// station's currbin, and validated against NOAA's own currents_predictions
// (see slackwater-engine/docs/research/2026-07-18-noaa-currents-api.md).
//
// We read that bundle rather than re-querying NOAA so there is ONE extractor: the
// per-bin/currbin traps it already solved don't get re-litigated here. NOAA data is
// public domain (tidesandcurrents.noaa.gov/disclaimers.html); predictions derived
// from it are UNOFFICIAL. Do not bundle CHS data here.
//
// Run: npx tsx scripts/refresh-constituents.ts
// Needs a slackwater-engine checkout; override its location with SLACKWATER_ENGINE.
// The generated DB is committed, so building the plugin never needs this.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ENGINE = process.env.SLACKWATER_ENGINE
  ?? join(__dirname, '..', '..', 'slackwater-engine');
const BUNDLE = join(ENGINE, 'Sources', 'TideEngine', 'Resources', 'currents.json');

// US-Salish stations we bundle offline constituents for.
const STATIONS = [
  'PUG1701', 'PUG1702', 'PUG1616', 'PUG1703',
  'PUG1718', 'PUG1724', 'PUG1734', 'PUG1735', 'PUG1717',
];

// Only constituents Neaps knows; skip the rest so nothing is silently dropped.
const NEAPS_KNOWN = new Set([
  'M2','S2','N2','K2','K1','O1','P1','Q1','M4','M6','MS4','MN4','2N2','MU2',
  'NU2','L2','T2','J1','M1','OO1','RHO','MM','SSA','SA','MSF','MF','LAM2',
  '2MK3','M3','MK3','S4','S6','M8','2SM2','SK3','2Q1',
]);

interface EngineStation {
  id: string; type: string;
  floodDirection: number; ebbDirection: number; offset?: number;
  constituents?: { name: string; amplitude: number; phase: number }[];
}

function main() {
  let bundle: { stations: EngineStation[] };
  try {
    bundle = JSON.parse(readFileSync(BUNDLE, 'utf8'));
  } catch {
    throw new Error(`Cannot read ${BUNDLE} — clone slackwater-engine beside this repo or set SLACKWATER_ENGINE`);
  }
  const byId = new Map(bundle.stations.map((s) => [s.id, s]));

  const stations: Record<string, unknown> = {};
  for (const id of STATIONS) {
    const s = byId.get(id);
    if (!s) throw new Error(`${id}: not in the engine bundle`);
    if (s.type !== 'harmonic') throw new Error(`${id}: type ${s.type}, expected harmonic`);
    stations[id] = {
      floodDir: s.floodDirection,
      ebbDir: s.ebbDirection,
      z0Kn: s.offset ?? 0, // NOAA majorMeanSpeed — the station's net mean flow
      constituents: (s.constituents ?? [])
        .filter((c) => NEAPS_KNOWN.has(c.name) && c.amplitude > 0)
        .map((c) => ({ name: c.name, amplitudeKn: c.amplitude, phaseDeg: c.phase })),
    };
  }

  const db = {
    generated: new Date().toISOString(),
    source: 'NOAA CO-OPS mdapi harcon via slackwater-engine (public domain; derived predictions are unofficial)',
    stations,
  };
  const out = join(__dirname, '..', 'data', 'harmonic-constituents.json');
  writeFileSync(out, JSON.stringify(db, null, 2) + '\n');
  console.log(`Wrote ${out} (${Object.keys(stations).length} stations)`);
}

main();
