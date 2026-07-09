import { describe, it, expect } from 'vitest';
import { synthesizeEvents } from '../src/sources/harmonic';
import type { HarmonicStation } from '../src/sources/harmonic';

const M2_HALF_PERIOD_H = 360 / 28.9841042 / 2; // ≈ 6.2103 h between successive extrema

const M2_ONLY: HarmonicStation = {
  bin: 0, floodDir: 90, ebbDir: 270,
  constituents: [{ name: 'M2', amplitudeKn: 2, phaseDeg: 0 }],
};

describe('major-axis harmonic synthesis (M2 only)', () => {
  const start = new Date('2026-07-01T00:00:00Z');
  const end = new Date('2026-07-02T01:00:00Z'); // ~25 h → 4 flood/ebb extrema
  const events = synthesizeEvents(M2_ONLY, start, end);

  it('alternates slack/flood-or-ebb and peaks near the amplitude', () => {
    const floodsEbbs = events.filter((e) => e.kind !== 'slack');
    expect(floodsEbbs.length).toBeGreaterThanOrEqual(3);
    for (const e of floodsEbbs) expect(e.speedKn).toBeGreaterThan(1.9); // ≈ 2.0
    for (const e of floodsEbbs) expect(e.speedKn).toBeLessThan(2.1);
  });

  it('flood and ebb extrema alternate', () => {
    const kinds = events.filter((e) => e.kind !== 'slack').map((e) => e.kind);
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
  });

  it('spaces successive extrema by half the M2 period', () => {
    const times = events.filter((e) => e.kind !== 'slack').map((e) => Date.parse(e.utc));
    for (let i = 1; i < times.length; i++) {
      const gapH = (times[i] - times[i - 1]) / 3.6e6;
      expect(Math.abs(gapH - M2_HALF_PERIOD_H)).toBeLessThan(0.2);
    }
  });

  it('places a zero-speed slack between consecutive extrema', () => {
    const slacks = events.filter((e) => e.kind === 'slack');
    expect(slacks.length).toBeGreaterThanOrEqual(3);
    for (const s of slacks) expect(s.speedKn).toBe(0);
  });

  it('returns events sorted by time', () => {
    const t = events.map((e) => Date.parse(e.utc));
    expect(t).toEqual([...t].sort((a, b) => a - b));
  });
});
