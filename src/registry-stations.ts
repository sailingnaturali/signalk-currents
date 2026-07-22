import registry from '@sailingnaturali/station-corrections/data/registry.json';
import { StationConfig } from './types';

// The plugin's transit-safety judgment (no upstream source publishes it): strong
// passages where the offline harmonic model must not be trusted for a transit
// decision. Matched by registry label. Formerly the per-station requiresLive flags
// in defaults.ts, before the CHS gate list moved to the registry.
export const STRONG_GATES = new Set<string>([
  'Seymour Narrows', 'Dent Rapids', 'Gillard Passage', 'Dodd Narrows', 'Active Pass',
  'Beazley Passage', 'Hole in the Wall', 'Arran Rapids', 'Sechelt Rapids',
]);

interface RegistryEntry { name: string; position: number[]; provider: string; }
type RegistryData = Record<string, RegistryEntry>;

/**
 * The CHS gate list, sourced from the shared registry by name/key — NEVER from a
 * committed CHS id, and NEVER reading `providerId` (dropped in registry 2.0.0).
 * `stationId` holds the stable registry key; the live IWLS id is resolved
 * separately at runtime (see resolveLiveIds) and set on `liveId`.
 */
export function registryChsStations(data: RegistryData = registry as RegistryData): StationConfig[] {
  return Object.entries(data)
    .filter(([, e]) => e.provider === 'chs')
    .map(([key, e]) => ({
      provider: 'chs' as const,
      stationId: key,
      label: e.name,
      lat: e.position[0],
      lon: e.position[1],
      requiresLive: STRONG_GATES.has(e.name) ? true : undefined,
    }));
}
