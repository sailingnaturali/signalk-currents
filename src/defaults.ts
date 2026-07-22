import { StationConfig } from './types';

// The plugin ships NO Canadian (CHS) station data — CHS is copyrighted Crown
// data whose id and constituents must not be committed (see Phase 3 spec). The
// CHS gate list is sourced at runtime from @sailingnaturali/station-corrections
// (registry-stations.ts) and live ids are resolved from IWLS by name; offline CHS
// prediction comes from a bundle the operator builds locally.
//
// Only NOAA (US-Government public domain) is bundled. Set directions come from
// the provider at runtime (dirsSource: 'api'); config floodDir/ebbDir stay
// available as a per-station override.
export const DEFAULT_STATIONS: StationConfig[] = [
  { provider: 'noaa', stationId: 'PUG1717', noaaBin: 35, label: 'Boundary Pass', lat: 48.6912, lon: -123.245 },
];
