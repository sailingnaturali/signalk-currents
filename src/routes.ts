import type { IRouter, Request, Response } from 'express';
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

// Register /currents on the router SignalK hands the plugin via
// registerWithRouter — no own express instance needed, so express stays a
// dev-only types dependency and isn't a runtime dep. (`import type` is erased.)
export function registerCurrentsRoute(
  router: IRouter, getSeries: () => Map<string, StationSeries>,
): void {
  router.get('/currents', (_req: Request, res: Response) =>
    res.json(currentsPayload(getSeries())));
}
