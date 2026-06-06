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
  floodDir: number;  // °true, set when flooding
  ebbDir: number;    // °true, set when ebbing
}

export function eventFromParts(utc: string, kind: CurrentKind, speed: number): CurrentEvent {
  return { utc: new Date(utc).toISOString(), kind, speedKn: Math.abs(speed) };
}
