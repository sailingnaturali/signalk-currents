import { StationConfig } from './types';

// Default tidal-current stations for the Salish Sea / Desolation Sound cruising
// ground. Station IDs and coordinates mirror the currents-mcp passage database
// (passages.py) verbatim, so every gate the MCP knows resolves in /currents
// out of the box — no hand-configuration, and no drift between the two lists.
//
// Set directions are not hardcoded here: both providers publish them
// authoritatively — NOAA as meanFloodDir/meanEbbDir inline with each prediction,
// CHS as floodDirection/ebbDirection in station metadata — and the plugin fetches
// them at runtime (dirsSource: 'api'). Config floodDir/ebbDir remain available as
// a per-station override/fallback if you add a station a provider doesn't cover.
export const DEFAULT_STATIONS: StationConfig[] = [
  { provider: 'chs', stationId: '63aef1866a2b9417c035030f', label: 'Dodd Narrows', lat: 49.1344, lon: -123.8171, requiresLive: true },
  { provider: 'chs', stationId: '63aef09f84e5432cd3b6c509', label: 'Active Pass', lat: 48.8604, lon: -123.3128, requiresLive: true },
  { provider: 'chs', stationId: '63aef0ed84e5432cd3b6c50b', label: 'Porlier Pass', lat: 49.015, lon: -123.585, requiresLive: true },
  { provider: 'chs', stationId: '63aef12e84e5432cd3b6db8d', label: 'Gabriola Passage', lat: 49.1291, lon: -123.7043, requiresLive: true },
  { provider: 'chs', stationId: '63aefc7784e5432cd3b6eb1e', label: 'Seymour Narrows', lat: 50.1333, lon: -125.35, requiresLive: true },
  { provider: 'chs', stationId: '63aefe506a2b9417c0350720', label: 'Beazley Passage', lat: 50.2263, lon: -125.142, requiresLive: true },
  { provider: 'chs', stationId: '63aefcb26a2b9417c035071e', label: 'Hole in the Wall', lat: 50.3001, lon: -125.2083, requiresLive: true },
  { provider: 'chs', stationId: '5dd3064fe0fdc4b9b4be6978', label: 'Gillard Passage', lat: 50.3933, lon: -125.1567, requiresLive: true },
  { provider: 'chs', stationId: '63af06d56a2b9417c0353451', label: 'Dent Rapids', lat: 50.41, lon: -125.2117, requiresLive: true },
  { provider: 'chs', stationId: '63aeff5884e5432cd3b71283', label: 'Arran Rapids', lat: 50.42, lon: -125.14, requiresLive: true },
  { provider: 'noaa', stationId: 'PUG1717', noaaBin: 35, label: 'Boundary Pass', lat: 48.6912, lon: -123.245 },
];
