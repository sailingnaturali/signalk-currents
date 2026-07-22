import registry from '@sailingnaturali/station-corrections/data/registry.json';
import { StationConfig } from './types';

// Open-strait stations where the current is advisory (speed-made-good), not a
// transit slack window — the ONLY CHS gates whose offline harmonic reading is not
// flagged unreliableForTransit. Every other (constricted) gate is requiresLive:
// the safety-conservative default, so a newly-added registry gate is flagged until
// it's confirmed an open strait.
export const OPEN_STRAITS = new Set<string>(['Juan de Fuca - East', 'Johnstone Strait - Central']);

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
      requiresLive: OPEN_STRAITS.has(e.name) ? undefined : true,
    }));
}

// The effective station list: the config default (NOAA only) plus every CHS gate
// from the shared registry (unless includeChs is false, for a non-BC operator who
// wants to skip the registry gates + the IWLS fetch entirely). Config entries win
// on stationId collision, so an operator can override a registry gate locally
// without editing the registry.
export function effectiveStations(configStations: StationConfig[], includeChs = true): StationConfig[] {
  const byId = new Map<string, StationConfig>();
  if (includeChs) for (const s of registryChsStations()) byId.set(s.stationId, s);
  for (const s of configStations) byId.set(s.stationId, s); // config overrides registry
  return [...byId.values()];
}
