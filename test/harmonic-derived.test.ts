import { describe, it, expect } from 'vitest';
import { createTidePredictor } from '@neaps/tide-predictor';
import { synthesizeDerivedHorizon, type TideStation, type DerivedGate } from '../src/sources/harmonic';

// A derived gate (Malibu Rapids) has NO current station: slack is the reference
// tide port's high/low water shifted by a fixed lag, with NO speed (CHS predicts
// no current there). synthesizeDerivedHorizon must produce slack-only events at
// reference HW+hwLag / LW+lwLag.
const TIDE: TideStation = {
  z0M: 3.0,
  constituents: [
    { name: 'M2', amplitudeKn: 0.95, phaseDeg: 40 },
    { name: 'S2', amplitudeKn: 0.26, phaseDeg: 70 },
    { name: 'K1', amplitudeKn: 0.85, phaseDeg: 250 },
    { name: 'O1', amplitudeKn: 0.48, phaseDeg: 230 },
  ],
};
const GATE: DerivedGate = { reference: 'chs-point-atkinson', hwLagMinutes: 25, lwLagMinutes: 35 };

describe('synthesizeDerivedHorizon', () => {
  it('emits slack-only events, each one lag after a reference HW/LW, and never a speed', () => {
    const now = new Date('2026-03-11T00:00:00Z');
    const horizonDays = 3;
    const { events } = synthesizeDerivedHorizon(GATE, TIDE, now, horizonDays);

    expect(events.length).toBeGreaterThan(3);
    // Every event is a slack with exactly zero speed — no fabricated knots.
    expect(events.every((e) => e.kind === 'slack' && e.speedKn === 0)).toBe(true);

    // Each slack sits exactly one lag after a reference extreme of the matching kind.
    const predictor = createTidePredictor(
      TIDE.constituents.map((c) => ({ name: c.name, amplitude: c.amplitudeKn, phase: c.phaseDeg })),
      { offset: TIDE.z0M },
    );
    const base = new Date(Date.UTC(2026, 2, 11));
    // Match synthesizeDerivedHorizon's own padded window exactly: getExtremesPrediction's
    // prominence filter is window-relative, so a different window disagrees at the edges.
    const pad = Math.max(25, 35) * 60_000 + 3600_000;
    const extremes = predictor.getExtremesPrediction({
      start: new Date(base.getTime() - pad),
      end: new Date(base.getTime() + horizonDays * 86400_000 + pad),
    });
    for (const e of events) {
      const t = new Date(e.utc).getTime();
      const origin = extremes
        .map((x) => ({ dtHigh: Math.abs(t - (x.time.getTime() + 25 * 60_000)), dtLow: Math.abs(t - (x.time.getTime() + 35 * 60_000)) }))
        .reduce((m, x) => Math.min(m, x.dtHigh, x.dtLow), Infinity);
      expect(origin).toBeLessThan(1000); // within 1 s of an HW+25 or LW+35
    }
  });

  it('is empty when the horizon is empty', () => {
    const now = new Date('2026-03-11T00:00:00Z');
    expect(synthesizeDerivedHorizon(GATE, TIDE, now, 0).events).toEqual([]);
  });
});
