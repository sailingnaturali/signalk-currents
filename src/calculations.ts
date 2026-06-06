import { getDistance } from 'geolib';
import { CurrentEvent, StationConfig } from './types';

export function nearestStation(
  lat: number, lon: number, stations: StationConfig[],
): StationConfig | undefined {
  if (stations.length === 0) return undefined;
  return stations.reduce((best, s) =>
    getDistance({ latitude: lat, longitude: lon }, { latitude: s.lat, longitude: s.lon }) <
    getDistance({ latitude: lat, longitude: lon }, { latitude: best.lat, longitude: best.lon })
      ? s : best);
}

const KN_TO_MS = 0.514444;

export interface CurrentValue { drift: number; setTrue: number; } // m/s, radians

export function interpolateCurrent(
  now: Date, events: CurrentEvent[], station: StationConfig,
): CurrentValue | undefined {
  const t = now.getTime();
  // bracketing consecutive pair e0 <= t <= e1
  let e0: CurrentEvent | undefined, e1: CurrentEvent | undefined;
  for (let i = 0; i < events.length - 1; i++) {
    if (Date.parse(events[i].utc) <= t && t <= Date.parse(events[i + 1].utc)) {
      e0 = events[i]; e1 = events[i + 1]; break;
    }
  }
  if (!e0 || !e1) return undefined;
  const frac = (t - Date.parse(e0.utc)) / (Date.parse(e1.utc) - Date.parse(e0.utc));
  let speedKn: number; let extremum: CurrentEvent;
  if (e0.kind === 'slack') { speedKn = e1.speedKn * Math.sin((Math.PI / 2) * frac); extremum = e1; }
  else if (e1.kind === 'slack') { speedKn = e0.speedKn * Math.cos((Math.PI / 2) * frac); extremum = e0; }
  else { speedKn = e0.speedKn + (e1.speedKn - e0.speedKn) * frac; extremum = e0; } // rare flood↔ebb, linear
  const dir = extremum.kind === 'ebb' ? station.ebbDir : station.floodDir;
  if (dir === undefined) return undefined; // no honest setTrue without a set direction
  return { drift: speedKn * KN_TO_MS, setTrue: (dir * Math.PI) / 180 };
}
