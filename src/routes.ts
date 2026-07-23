import { StationConfig, CurrentEvent, DirsSource, CurrentSource } from './types';

export interface StationSeries {
  station: StationConfig;
  events: CurrentEvent[];
  dirsSource?: DirsSource;
  source: CurrentSource;
  live: boolean;
  // A derived gate (Malibu Rapids): slack TIMING only, no speed and no flood/ebb
  // axis. Consumers must present slack windows, never a current vector.
  derived?: boolean;
}

// The payload served by the `currents` resource provider (registered in
// index.ts) at /signalk/v2/api/resources/currents.
export function currentsPayload(series: Map<string, StationSeries>) {
  return {
    stations: [...series.values()].map(s => ({
      stationId: s.station.stationId, label: s.station.label,
      lat: s.station.lat, lon: s.station.lon,
      floodDir: s.station.floodDir, ebbDir: s.station.ebbDir,
      dirsSource: s.dirsSource,
      // Estimated flags qualify *config* values; API-measured dirs supersede
      // the config entry the flags were describing.
      floodDirEstimated: s.dirsSource === 'config' ? s.station.floodDirEstimated : undefined,
      ebbDirEstimated: s.dirsSource === 'config' ? s.station.ebbDirEstimated : undefined,
      source: s.source,
      live: s.live,
      unreliableForTransit: s.station.requiresLive === true && !s.live,
      derived: s.derived,
      events: s.events,
    })),
  };
}
