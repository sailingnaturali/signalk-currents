import { describe, it, expect } from 'vitest';
import { synthesizeHorizon } from '../src/sources/harmonic';
import type { HarmonicStation } from '../src/sources/harmonic';

const STA: HarmonicStation = {
  bin: 0, floodDir: 111, ebbDir: 291,
  constituents: [
    { name: 'M2', amplitudeKn: 2, phaseDeg: 0 },
    { name: 'K1', amplitudeKn: 0.6, phaseDeg: 40 },
  ],
};

describe('synthesizeHorizon', () => {
  it('covers the requested UTC-day horizon and carries the dirs', () => {
    const start = new Date('2026-07-01T12:00:00Z');
    const data = synthesizeHorizon(STA, start, 3);
    expect(data.floodDir).toBe(111);
    expect(data.ebbDir).toBe(291);
    expect(data.events.length).toBeGreaterThan(10);
    // spans from the UTC day start through 3 days
    const first = Date.parse(data.events[0].utc);
    const last = Date.parse(data.events[data.events.length - 1].utc);
    expect(first).toBeGreaterThanOrEqual(Date.parse('2026-07-01T00:00:00Z'));
    expect(last).toBeLessThan(Date.parse('2026-07-04T00:00:00Z'));
  });
});
