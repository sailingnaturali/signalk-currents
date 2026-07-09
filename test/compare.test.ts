import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { computeDiscrepancy, appendDiscrepancy } from '../src/compare';
import { CurrentEvent } from '../src/types';

const ev = (utc: string, kind: CurrentEvent['kind'], speedKn: number): CurrentEvent => ({ utc, kind, speedKn });
const now = new Date('2026-07-01T00:00:00Z');

const live: CurrentEvent[] = [
  ev('2026-07-01T01:00:00Z', 'slack', 0),
  ev('2026-07-01T04:00:00Z', 'flood', 6),
];
const harmonic: CurrentEvent[] = [
  ev('2026-07-01T01:12:00Z', 'slack', 0), // +12 min
  ev('2026-07-01T04:00:00Z', 'flood', 6.5), // +0.5 kn
];

describe('computeDiscrepancy', () => {
  it('reports the signed next-slack delta in minutes and the peak-rate delta', () => {
    const d = computeDiscrepancy('PUG1701', 'Deception Pass', live, harmonic, now);
    expect(d.slackDeltaMin).toBeCloseTo(12, 5);
    expect(d.peakRateDeltaKn).toBeCloseTo(0.5, 5);
    expect(d.stationId).toBe('PUG1701');
  });

  it('returns null deltas when a series has no comparable event', () => {
    const d = computeDiscrepancy('X', 'X', [], harmonic, now);
    expect(d.slackDeltaMin).toBeNull();
  });
});

describe('appendDiscrepancy', () => {
  it('appends one JSON line per call', () => {
    const f = join(tmpdir(), `disc-${Date.now()}.jsonl`);
    const d = computeDiscrepancy('PUG1701', 'Deception Pass', live, harmonic, now);
    appendDiscrepancy(f, d);
    appendDiscrepancy(f, d);
    const lines = readFileSync(f, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).stationId).toBe('PUG1701');
    rmSync(f);
  });
});
