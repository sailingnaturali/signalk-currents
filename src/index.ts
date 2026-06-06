import { Plugin, ServerAPI } from '@signalk/server-api';

export = function (app: ServerAPI): Plugin {
  const plugin: Plugin = {
    id: 'signalk-currents',
    name: 'Tidal currents (CHS/NOAA)',
    description: 'Publishes tidal-current predictions to environment.current and a /currents resource.',
    schema: {}, // filled in Task 6
    start: () => {},
    stop: () => {},
  };
  return plugin;
};
