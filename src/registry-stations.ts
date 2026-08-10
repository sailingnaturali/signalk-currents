import registry from '@sailingnaturali/station-corrections/data/registry.json';
import { StationConfig } from './types';

// Open-strait stations where the current is advisory (speed-made-good), not a
// transit slack window — the ONLY CHS gates whose offline harmonic reading is not
// flagged unreliableForTransit. Every other (constricted) gate is requiresLive:
// the safety-conservative default, so a newly-added registry gate is flagged until
// it's confirmed an open strait.
export const OPEN_STRAITS = new Set<string>(['Juan de Fuca - East', 'Johnstone Strait - Central']);

interface DerivedBlock { reference: string; hwLagMinutes: number; lwLagMinutes: number; }
interface RegistryEntry {
  name: string; position: number[]; provider: string;
  // Absent means 'current': the registry was currents-only before it grew tide ports.
  kind?: 'tide' | 'current';
  derived?: DerivedBlock;
}
type RegistryData = Record<string, RegistryEntry>;

export interface DerivedGateConfig {
  stationId: string; label: string; lat: number; lon: number;
  reference: string; hwLagMinutes: number; lwLagMinutes: number;
}

/**
 * The derived CHS gates (Malibu Rapids): passes with no current station of their
 * own, served from a reference tide port's HW/LW + lags. Kept separate from
 * registryChsStations because they have no live source and never carry a current
 * vector — a distinct pass in the plugin serves their slack timing to /currents only.
 */
export function registryDerivedGates(data: RegistryData = registry as RegistryData): DerivedGateConfig[] {
  return Object.entries(data)
    .filter(([, e]) => e.provider === 'chs' && e.derived !== undefined)
    .map(([key, e]) => ({
      stationId: key, label: e.name, lat: e.position[0], lon: e.position[1],
      reference: e.derived!.reference,
      hwLagMinutes: e.derived!.hwLagMinutes,
      lwLagMinutes: e.derived!.lwLagMinutes,
    }));
}

/**
 * The CHS gate list, sourced from the shared registry by name/key — NEVER from a
 * committed CHS id, and NEVER reading `providerId` (dropped in registry 2.0.0).
 * `stationId` holds the stable registry key; the live IWLS id is resolved
 * separately at runtime (see resolveLiveIds) and set on `liveId`.
 */
export function registryChsStations(data: RegistryData = registry as RegistryData): StationConfig[] {
  return Object.entries(data)
    // Skip derived gates (e.g. Malibu Rapids). CHS publishes no current station
    // for them, so there's no live IWLS id to resolve and nothing for
    // chs-constituents to fit — including one just throws "no live id" every
    // cycle. Their slack derives from a reference tide port; serving that is
    // Phase 2 (see station-corrections' `derived` block). Until then, not our data.
    //
    // Skip tide reference ports too (station-corrections 2.3.0+ carries them so a
    // gate can name its companion port). They publish no wcsp1 current series, so
    // resolveLiveIds finds nothing and every one threw "no live id for <port>" on
    // every poll cycle — ten of them on the boat Pi, 2026-08-10. Harmless (the
    // station is dropped) but it burns a fetch attempt and buries real errors.
    .filter(([, e]) => e.provider === 'chs' && e.derived === undefined && e.kind !== 'tide')
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
  const registryStations = includeChs ? registryChsStations() : [];
  // A config written before registry 2.0.0 still names a gate by its provider-minted
  // CHS id (a UUID). That never collides with the registry's slug, so the same gate
  // was served twice and the stale id resolved no live id either — 19 duplicated gates
  // on the boat Pi, invisible because consumers key on label and silently drop one.
  // Re-key such an entry onto the registry slug so it lands as the OVERRIDE it was
  // always meant to be: the slug is what resolveLiveIds works from, and every other
  // field the operator set (set directions, estimate flags, bins) rides along.
  // Deliberately keyed on label, not position: renaming a station is the registry's
  // job and downstream is supposed to follow it.
  const registryByLabel = new Map(registryStations.map((s) => [s.label.trim().toLowerCase(), s]));

  const byId = new Map<string, StationConfig>();
  for (const s of registryStations) byId.set(s.stationId, s);
  for (const s of configStations) {                          // config overrides registry
    const gate = registryByLabel.get(s.label.trim().toLowerCase());
    const keyed = gate && gate.stationId !== s.stationId ? { ...s, stationId: gate.stationId } : s;
    byId.set(keyed.stationId, keyed);
  }
  return [...byId.values()];
}
