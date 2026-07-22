// Resolve live CHS current-station ids from the IWLS index by name. The plugin
// commits NO CHS id (licence); the id is fetched live here and used only to pull
// live data, under the operator's own CHS licence. Mirrors chs-constituents'
// station listing: GET /stations, keep the ~30 that publish a wcsp1 series.
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

export async function resolveLiveIds(fetchFn: typeof fetch = fetch): Promise<Map<string, string>> {
  const resp = await fetchFn(`${IWLS_BASE}/stations`);
  if (!resp.ok) throw new Error(`IWLS ${resp.status}`);
  const stations = currentStations((await resp.json()) as RawStation[]);
  return new Map(stations.map((s) => [normalizeName(s.officialName), s.id]));
}
