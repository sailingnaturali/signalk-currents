import { Plugin, ServerAPI } from '@signalk/server-api';

export = function (app: ServerAPI): Plugin {
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
    start: () => {},
    stop: () => {},
  };
  return plugin;
};
