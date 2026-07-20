export type CurrentKind = 'slack' | 'flood' | 'ebb';

export type CurrentSource = 'chs' | 'noaa' | 'harmonic';

export interface CurrentEvent {
  utc: string;       // canonical ISO8601 (UTC)
  kind: CurrentKind;
  speedKn: number;   // magnitude, always >= 0
}

export interface StationConfig {
  provider: 'chs' | 'noaa';
  stationId: string;
  noaaBin?: number;
  label: string;
  lat: number;
  lon: number;
  floodDir?: number; // °true, set when flooding (CHS: from config; NOAA: API overrides)
  ebbDir?: number;   // °true, set when ebbing
  // True when the config value is an assumption (e.g. reciprocal of a stated
  // flood) rather than a documented direction. Consumers should say so.
  floodDirEstimated?: boolean;
  ebbDirEstimated?: boolean;
  // Strong passage where harmonic fallback must not be trusted for transit
  // decisions — set per station in defaults.ts (no upstream source publishes
  // this judgment). When true and the reading is harmonic-only, consumers get
  // unreliableForTransit: true.
  requiresLive?: boolean;
}

export interface StationDirs {
  floodDir?: number;
  ebbDir?: number;
}

// Measured dirs from the provider (NOAA meanFloodDir/meanEbbDir) beat whatever
// was typed into config; config is the fallback (and the only source for CHS).
export function resolveStation(station: StationConfig, fetched: StationDirs): StationConfig {
  return {
    ...station,
    floodDir: fetched.floodDir ?? station.floodDir,
    ebbDir: fetched.ebbDir ?? station.ebbDir,
  };
}

export type DirsSource = 'api' | 'config';

// Where the resolved directions came from: provider-measured ('api'), config
// ('config'), or undefined when neither knows.
export function dirsSource(station: StationConfig, fetched: StationDirs): DirsSource | undefined {
  if (fetched.floodDir !== undefined || fetched.ebbDir !== undefined) return 'api';
  if (station.floodDir !== undefined || station.ebbDir !== undefined) return 'config';
  return undefined;
}

export function eventFromParts(utc: string, kind: CurrentKind, speed: number): CurrentEvent {
  return { utc: new Date(utc).toISOString(), kind, speedKn: Math.abs(speed) };
}
