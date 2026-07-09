import { appendFileSync } from 'fs';
import { CurrentEvent } from './types';

export interface Discrepancy {
  utc: string; stationId: string; label: string;
  slackDeltaMin: number | null;
  peakRateDeltaKn: number | null;
}

function nextSlackAfter(events: CurrentEvent[], now: Date): number | undefined {
  const t = now.getTime();
  const s = events.find((e) => e.kind === 'slack' && Date.parse(e.utc) >= t);
  return s ? Date.parse(s.utc) : undefined;
}

function peakRate(events: CurrentEvent[]): number | undefined {
  const speeds = events.filter((e) => e.kind !== 'slack').map((e) => e.speedKn);
  return speeds.length ? Math.max(...speeds) : undefined;
}

// Compare a harmonic series against live for the same station/window. Deltas are
// signed (harmonic − live): +slackDeltaMin = harmonic slack is later; null when
// one side lacks a comparable event.
export function computeDiscrepancy(
  stationId: string, label: string, live: CurrentEvent[], harmonic: CurrentEvent[], now: Date,
): Discrepancy {
  const ls = nextSlackAfter(live, now), hs = nextSlackAfter(harmonic, now);
  const lp = peakRate(live), hp = peakRate(harmonic);
  return {
    utc: now.toISOString(), stationId, label,
    slackDeltaMin: ls !== undefined && hs !== undefined ? (hs - ls) / 60000 : null,
    peakRateDeltaKn: lp !== undefined && hp !== undefined ? hp - lp : null,
  };
}

// Best-effort local JSONL append. Never throws into the caller — a logging
// failure must not disturb the currents publish.
export function appendDiscrepancy(file: string, d: Discrepancy): void {
  try {
    appendFileSync(file, JSON.stringify(d) + '\n');
  } catch {
    /* swallow: local diagnostics only */
  }
}
