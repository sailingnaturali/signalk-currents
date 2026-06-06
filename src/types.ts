export type CurrentKind = 'slack' | 'flood' | 'ebb';

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

export function eventFromParts(utc: string, kind: CurrentKind, speed: number): CurrentEvent {
  return { utc: new Date(utc).toISOString(), kind, speedKn: Math.abs(speed) };
}
