import { Router } from 'express';
import { StationConfig, CurrentEvent } from './types';

export interface StationSeries { station: StationConfig; events: CurrentEvent[]; }

export function currentsPayload(series: Map<string, StationSeries>) {
  return {
    stations: [...series.values()].map(s => ({
      stationId: s.station.stationId, label: s.station.label,
      lat: s.station.lat, lon: s.station.lon, events: s.events,
    })),
  };
}

// Mirror signalk-tides/src/routes.ts for how the router is registered with `app`.
export function currentsRouter(getSeries: () => Map<string, StationSeries>): Router {
  const r = Router();
  r.get('/currents', (_req, res) => res.json(currentsPayload(getSeries())));
  return r;
}
