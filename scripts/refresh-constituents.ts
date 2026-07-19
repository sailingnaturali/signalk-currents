// Regenerates data/harmonic-constituents.json — the offline fallback constituents for
// the US-Salish stations in the default gate list.
//
// Extraction lives in @sailingnaturali/current-stations, shared with the Swift
// engine, so the NOAA traps (harcon is empty at any bin but `currbin`; a reference is
// (station, bin); a type-S station with its own harcon is harmonic) stay solved in one
// place. See https://github.com/sailingnaturali/current-stations/blob/main/docs/noaa-api.md
//
// NOAA data is public domain; derived predictions are UNOFFICIAL. No CHS data here.
// Run: npm run refresh:constituents
import { writeFileSync } from 'fs';
import { join } from 'path';
import { extractBundle } from '@sailingnaturali/current-stations';

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

async function main() {
  const { bundle, skipped } = await extractBundle({
    stations: STATIONS,
    log: (m) => console.log(m),
  });
  if (skipped.failed.length) throw new Error(`NOAA fetches failed: ${skipped.failed.join('; ')}`);

  // Emit in STATIONS order, not NOAA's, so a refresh diffs cleanly against the last one.
  const byId = new Map(bundle.stations.map((s) => [s.id, s]));
  const stations: Record<string, unknown> = {};
  for (const id of STATIONS) {
    const s = byId.get(id);
    if (!s) continue;
    if (s.type !== 'harmonic') throw new Error(`${s.id}: expected harmonic, got ${s.type}`);
    stations[s.id] = {
      floodDir: s.floodDirection,
      ebbDir: s.ebbDirection,
      z0Kn: s.offset, // NOAA majorMeanSpeed — net mean flow; shifts every slack
      constituents: s.constituents
        .filter((c) => NEAPS_KNOWN.has(c.name) && c.amplitude > 0)
        .map((c) => ({ name: c.name, amplitudeKn: c.amplitude, phaseDeg: c.phase })),
    };
  }
  const missing = STATIONS.filter((id) => !stations[id]);
  if (missing.length) throw new Error(`missing from the bundle: ${missing.join(', ')}`);

  const db = {
    generated: new Date().toISOString(),
    source: 'NOAA CO-OPS mdapi harcon via @sailingnaturali/current-stations '
      + '(public domain; derived predictions are unofficial)',
    stations,
  };
  const out = join(__dirname, '..', 'data', 'harmonic-constituents.json');
  writeFileSync(out, JSON.stringify(db, null, 2) + '\n');
  console.log(`Wrote ${out} (${Object.keys(stations).length} stations)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
