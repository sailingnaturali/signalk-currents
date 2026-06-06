import { StationConfig, CurrentEvent } from './types';

export interface StationSeries { station: StationConfig; events: CurrentEvent[]; }

// The payload served by the `currents` resource provider (registered in
// index.ts) at /signalk/v2/api/resources/currents.
export function currentsPayload(series: Map<string, StationSeries>) {
  return {
    stations: [...series.values()].map(s => ({
      stationId: s.station.stationId, label: s.station.label,
      lat: s.station.lat, lon: s.station.lon, events: s.events,
    })),
  };
}
