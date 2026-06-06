import { Plugin, ServerAPI, Path, Position } from '@signalk/server-api';
import { StationConfig } from './types';
import { createCache, DayCache } from './cache';
import { stationEvents } from './fetch';
import { nearestStation, interpolateCurrent } from './calculations';
import { currentsPayload, StationSeries } from './routes';

interface Options {
  stations?: StationConfig[];
  horizonDays?: number;
  pollMinutes?: number;
}

export = function (app: ServerAPI): Plugin {
  // Cache of per-day events keyed by `provider:station:YYYY-MM-DD`, and the
  // current per-station series exposed via /currents. Both live for the
  // lifetime of the plugin process and are read by the route handler.
  const cache: DayCache = createCache();
  const series = new Map<string, StationSeries>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const plugin: Plugin = {
    id: 'signalk-currents',
    name: 'Tidal currents (CHS/NOAA)',
    description: 'Publishes tidal-current predictions to environment.current and a /currents resource.',
    schema: {
      type: 'object',
      properties: {
        stations: {
          type: 'array', title: 'Current stations',
          items: { type: 'object', required: ['provider', 'stationId', 'label', 'lat', 'lon', 'floodDir', 'ebbDir'],
            properties: {
              provider: { type: 'string', enum: ['chs', 'noaa'] },
              stationId: { type: 'string' }, noaaBin: { type: 'number' },
              label: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' },
              floodDir: { type: 'number', title: 'Flood set (°true)' },
              ebbDir: { type: 'number', title: 'Ebb set (°true)' },
            } },
        },
        horizonDays: { type: 'number', default: 3 },
        pollMinutes: { type: 'number', default: 60 },
      },
    },

    start(options: Options) {
      const stations = options.stations ?? [];
      const horizonDays = options.horizonDays ?? 3;
      const pollMinutes = options.pollMinutes ?? 60;

      // Expose the per-station series as a SignalK resource — served at
      // /signalk/v2/api/resources/currents, anonymously readable under
      // allow_readonly like the rest of the data API. (A registerWithRouter
      // /plugins/<id> route is gated behind admin auth — wrong mechanism here.)
      app.registerResourceProvider({
        type: 'currents',
        methods: {
          async listResources() {
            return currentsPayload(series) as unknown as Record<string, unknown>;
          },
          getResource(): never { throw new Error('Not implemented'); },
          setResource(): never { throw new Error('Not implemented'); },
          deleteResource(): never { throw new Error('Not implemented'); },
        },
      });

      async function refresh() {
        try {
          const now = new Date();

          // Refresh each station's series from the cached day fetch. Isolate
          // per-station failures so one bad CHS/NOAA response can't blank the
          // others (or skip the environment.current publish) for the whole cycle.
          for (const station of stations) {
            try {
              const events = await stationEvents(station, now, horizonDays, cache);
              series.set(station.stationId, { station, events });
            } catch (e) {
              app.error(`station ${station.label} fetch failed: ${(e as Error).message}`);
            }
          }

          // Read the vessel's position (mirrors signalk-tides: reads the
          // `.value` of navigation.position via getSelfPath).
          const position = app.getSelfPath('navigation.position.value') as Position | undefined;
          if (!position) {
            app.debug('No position available; skipping environment.current publish');
            app.setPluginStatus(`Fetched ${series.size} station(s); awaiting position`);
            return;
          }

          const station = nearestStation(position.latitude, position.longitude, stations);
          const entry = station ? series.get(station.stationId) : undefined;
          if (!station || !entry) {
            app.setPluginStatus('No station near vessel position');
            return;
          }

          const current = interpolateCurrent(now, entry.events, station);
          if (!current) {
            app.setPluginStatus(`No current data bracketing now for ${station.label}`);
            return;
          }

          // Publish environment.current as a SignalK delta. handleMessage takes
          // a Partial<Delta>; the path is a branded type so it is cast.
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [
                  {
                    path: 'environment.current' as Path,
                    value: { drift: current.drift, setTrue: current.setTrue },
                  },
                ],
              },
            ],
          });
          app.setPluginStatus(
            `environment.current from ${station.label}: ${current.drift.toFixed(2)} m/s`,
          );
        } catch (e) {
          // One bad cycle must never kill the loop.
          app.error(`refresh failed: ${(e as Error).message}`);
          app.setPluginError((e as Error).message);
        }
      }

      // Initial fetch, then poll. Errors are swallowed inside refresh().
      refresh();
      timer = setInterval(refresh, pollMinutes * 60_000);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };

  return plugin;
};
