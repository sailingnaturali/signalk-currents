import { describe, it, expect } from 'vitest';
import { loadHarmonicDb, harmonicStationFor, synthesizeEvents } from '../src/sources/harmonic';
import oracle from './fixtures/noaa-pug1717-golden.json';

// Offline accuracy gate: our bundled-constituent synthesis vs NOAA's own published
// predictions for the same station/bin. This is what catches a dropped Z0 (mean-flow)
// term — without it slack timing drifts ~15 min mean / ~55 min worst at Boundary Pass.
// Fixture is public-domain NOAA data; regenerate with the URL in its `note`.
const start = new Date(`${oracle.begin}T00:00:00Z`);
const end = new Date(`${oracle.end}T00:00:00Z`);
end.setUTCDate(end.getUTCDate() + 1); // NOAA's end_date is inclusive

const MATCH_WINDOW_MIN = 180;

describe('harmonic synthesis vs NOAA oracle (PUG1717 Boundary Pass)', () => {
  const station = harmonicStationFor(loadHarmonicDb(), oracle.station);
  const events = synthesizeEvents(station!, start, end);

  // Pair each oracle event with the nearest synthesized event of the same kind.
  const pairs = oracle.events.map((o) => {
    const t = Date.parse(o.utc);
    const near = events
      .filter((e) => e.kind === o.kind)
      .sort((a, b) => Math.abs(Date.parse(a.utc) - t) - Math.abs(Date.parse(b.utc) - t))[0];
    if (!near || Math.abs(Date.parse(near.utc) - t) > MATCH_WINDOW_MIN * 60000) return undefined;
    return {
      dtMin: Math.abs(Date.parse(near.utc) - t) / 60000,
      dvKn: Math.abs(near.speedKn - Math.abs(o.velocityMajorKn)),
    };
  });

  it('matches every oracle event', () => {
    expect(pairs.filter(Boolean)).toHaveLength(oracle.events.length);
  });

  it('tracks NOAA timing to better than 10 min mean / 30 min worst', () => {
    const dt = pairs.filter(Boolean).map((p) => p!.dtMin);
    const mean = dt.reduce((a, b) => a + b, 0) / dt.length;
    expect(mean).toBeLessThan(10);
    expect(Math.max(...dt)).toBeLessThan(30);
  });

  it('tracks NOAA peak speeds to better than 0.10 kn mean', () => {
    const dv = pairs.filter(Boolean).map((p) => p!.dvKn);
    expect(dv.reduce((a, b) => a + b, 0) / dv.length).toBeLessThan(0.1);
  });
});
