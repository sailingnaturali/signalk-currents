// Resolve live CHS current-station ids from the IWLS index by name. The plugin
// commits NO CHS id (licence); the id is fetched live here and used only to pull
// live data, under the operator's own CHS licence. Mirrors chs-constituents'
// station listing: GET /stations, keep the ~30 that publish a wcsp1 series.
//
// Why name and not position, since the record never said: the licence forces
// SOME runtime join, not this one. The load-bearing part is the wcsp1 filter —
// it is what makes either key safe. Names alone are ambiguous without it (CHS
// publishes both a current station and a tide gauge called "Porlier Pass", and
// another pair called "Seymour Narrows"); positions alone are worse (the tide
// station Duffus Point sits at coordinates identical to Big Bras D'Or, so no
// tolerance separates them). Inside the filtered ~30, either key resolves all
// 23 registry gates uniquely — measured 2026-08-15: nearest station 170 m at
// worst, nearest false positive 978 m, so a position match would want a ~500 m
// tolerance. Name wins on the tiebreak because the registry owns the name and
// a rename there is meant to carry, while a position is a fact about water that
// says nothing about which record a reader meant. The cost is provider renames,
// which liveIdFor covers with the registry's aliases.
//
// sibling: slackwater-web/src/chs/resolve.ts joins by position (3 km, series-
// filtered) for tide ports. Both are correct; the filter is the invariant.
const IWLS_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

export interface IwlsStation { id: string; officialName: string; latitude: number; longitude: number; }
interface RawStation { id: string; officialName: string; latitude: number; longitude: number; timeSeries?: { code: string }[]; }

export function currentStations(raw: RawStation[]): IwlsStation[] {
  return raw
    .filter((s) => (s.timeSeries ?? []).some((t) => t.code === 'wcsp1'))
    .map(({ id, officialName, latitude, longitude }) => ({ id, officialName, latitude, longitude }));
}

// Same folding rule chs-constituents uses, so "JUAN DE FUCA - EAST" matches the
// registry's "Juan de Fuca - East".
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// The registry's name for a gate is not always CHS's name for the station that
// publishes it: the current file says "Masset Channel" for Masset Sound and "Big
// Bras D'Or" for Great Bras d'Or. The registry owns the name and carries the
// provider's as an alias, so try the label first — an alias must never shadow a
// gate whose own name matched — then the aliases.
export function liveIdFor(
  ids: Map<string, string>, label: string, aliases: readonly string[] = [],
): string | undefined {
  for (const name of [label, ...aliases]) {
    const id = ids.get(normalizeName(name));
    if (id) return id;
  }
  return undefined;
}

export async function resolveLiveIds(fetchFn: typeof fetch = fetch): Promise<Map<string, string>> {
  const resp = await fetchFn(`${IWLS_BASE}/stations`);
  if (!resp.ok) throw new Error(`IWLS ${resp.status}`);
  const stations = currentStations((await resp.json()) as RawStation[]);
  return new Map(stations.map((s) => [normalizeName(s.officialName), s.id]));
}
