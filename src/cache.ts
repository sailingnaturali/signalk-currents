import { CurrentEvent } from './types';

// In-memory day cache keyed by `provider:station:YYYY-MM-DD`. Per-day
// predictions are immutable, so entries can be reused freely. Kept trivial
// for now; swap for a persistent store later if desired.
export type DayCache = Map<string, CurrentEvent[]>;

export function createCache(): DayCache {
  return new Map<string, CurrentEvent[]>();
}
