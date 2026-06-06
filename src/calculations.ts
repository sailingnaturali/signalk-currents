import { getDistance } from 'geolib';
import { StationConfig } from './types';

export function nearestStation(
  lat: number, lon: number, stations: StationConfig[],
): StationConfig | undefined {
  if (stations.length === 0) return undefined;
  return stations.reduce((best, s) =>
    getDistance({ latitude: lat, longitude: lon }, { latitude: s.lat, longitude: s.lon }) <
    getDistance({ latitude: lat, longitude: lon }, { latitude: best.lat, longitude: best.lon })
      ? s : best);
}
