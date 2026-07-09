// Regenerates data/harmonic-constituents.json from NOAA CO-OPS public-domain
// harcon metadata. Run: npx tsx scripts/refresh-constituents.ts
// NOAA data is public domain (tidesandcurrents.noaa.gov/disclaimers.html);
// predictions derived from it are UNOFFICIAL. Do not bundle CHS data here.
import { writeFileSync } from 'fs';
import { join } from 'path';

const CM_S_PER_KNOT = 51.4444;
const MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations';

// stationId -> prediction bin (from the CO-OPS current-station metadata).
const STATIONS: Record<string, number> = {
  PUG1701: 18, PUG1702: 17, PUG1616: 31, PUG1703: 17,
  PUG1718: 36, PUG1724: 31, PUG1734: 14, PUG1735: 14, PUG1717: 35,
};

// Only constituents Neaps knows; skip the rest so nothing is silently dropped.
const NEAPS_KNOWN = new Set([
  'M2','S2','N2','K2','K1','O1','P1','Q1','M4','M6','MS4','MN4','2N2','MU2',
  'NU2','L2','T2','J1','M1','OO1','RHO','MM','SSA','SA','MSF','MF','LAM2',
  '2MK3','M3','MK3','S4','S6','M8','2SM2','SK3','2Q1',
]);

async function main() {
  const stations: Record<string, unknown> = {};
  for (const [id, bin] of Object.entries(STATIONS)) {
    const url = `${MDAPI}/${id}/harcon.json?bin=${bin}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${id}: NOAA ${resp.status}`);
    const hc = ((await resp.json())?.HarmonicConstituents ?? []) as any[];
    // harcon?bin= may return only that bin, or all bins each tagged binNbr.
    // Prefer rows matching our bin; if none are tagged, use them all.
    const forBin = hc.filter((c) => c.binNbr === bin);
    const rows = forBin.length ? forBin : hc;
    const constituents = rows
      .filter((c) => NEAPS_KNOWN.has(c.constituentName) && Number(c.majorAmplitude) > 0)
      .map((c) => ({
        name: c.constituentName as string,
        amplitudeKn: Number(c.majorAmplitude) / CM_S_PER_KNOT, // cm/s -> knots
        phaseDeg: Number(c.majorPhaseGMT),                     // Greenwich phase, degrees
      }));
    // Ellipse major-axis azimuth is the flood set (°true); ebb is the reciprocal.
    const azi = Number(rows[0]?.azi ?? 0);
    stations[id] = {
      bin,
      floodDir: ((azi % 360) + 360) % 360,
      ebbDir: ((azi + 180) % 360 + 360) % 360,
      constituents,
    };
  }
  const db = {
    generated: new Date().toISOString(),
    source: 'NOAA CO-OPS mdapi harcon (public domain; derived predictions are unofficial)',
    stations,
  };
  const out = join(__dirname, '..', 'data', 'harmonic-constituents.json');
  writeFileSync(out, JSON.stringify(db, null, 2) + '\n');
  console.log(`Wrote ${out} (${Object.keys(stations).length} stations)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
