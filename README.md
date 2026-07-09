# @sailingnaturali/signalk-currents

A generic [SignalK](https://signalk.org/) server plugin that fetches tidal-current
predictions from the **CHS** (Canadian Hydrographic Service) and **NOAA** tides &
currents APIs for a configured list of current stations, and:

- publishes **`environment.current`** — the interpolated current (`drift` in m/s,
  `setTrue` in radians) at the vessel, using the nearest configured station; and
- serves a **`/currents`** resource — the full slack / flood / ebb event series for
  every configured station.

There are **no hardcoded stations or gates** — the station list is plugin config, so
it works anywhere CHS or NOAA publishes current predictions.

## How it works

On start, and then every `pollMinutes`, the plugin:

1. Fetches each station's events for the next `horizonDays` UTC days (one fetch per
   station-day, cached in memory — per-day predictions are immutable).
2. Reads the vessel position (`navigation.position`), picks the nearest configured
   station, interpolates the current for "now", and publishes an `environment.current`
   delta.
3. Keeps the per-station event series available at `/currents`.

Set directions come from the provider: CHS publishes `floodDirection`/`ebbDirection`
in station metadata, NOAA reports measured `meanFloodDir`/`meanEbbDir` — the plugin
fetches them at poll time so `setTrue` is authoritative, not hand-entered.

Interpolation is a quarter-sine model between each slack (speed 0) and the adjacent
flood/ebb maximum: ramping up uses `Vmax·sin(π/2·frac)`, ramping down uses
`Vmax·cos(π/2·frac)`. `setTrue` is the extremum's set direction (the flood set when
flooding, the ebb set when ebbing).

## Configuration

Configured from the SignalK server plugin UI.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stations` | array | 11 Salish Sea / Desolation Sound gates (see below) | Current stations. |
| `horizonDays` | number | `3` | How many UTC days of predictions to fetch/keep. |
| `pollMinutes` | number | `60` | How often to refresh and republish. |

**Default stations.** Out of the box the plugin ships the Salish Sea / Desolation
Sound tidal gates (Dodd Narrows, Active/Porlier/Gabriola Passages, Seymour
Narrows, Beazley Passage, Hole in the Wall, Gillard Passage, Dent and Arran
Rapids, and Boundary Pass), so `/currents` is populated without any configuration.
Station IDs mirror the [`currents-mcp`](https://github.com/sailingnaturali/currents-mcp)
passage database, so every gate that MCP knows resolves here. Edit or replace the
list for your own cruising ground. Set directions aren't baked into the defaults —
both providers publish them (CHS in station metadata, NOAA inline), so every gate
gets an authoritative `setTrue` fetched at runtime.

Each entry in `stations`:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `"chs"` \| `"noaa"` | Prediction source. |
| `stationId` | string | CHS station id, or NOAA station id (e.g. `PUG1717`). |
| `noaaBin` | number | NOAA current-station bin (NOAA only). |
| `label` | string | Human-readable name. |
| `lat` / `lon` | number | Station position (used for nearest-station selection). |
| `floodDir` | number | **Optional override** for the flood set (°true). Both providers publish this authoritatively — CHS as `floodDirection` in station metadata, NOAA as the measured `meanFloodDir` — and the fetched value wins. Configure it only for a station the provider doesn't cover. |
| `ebbDir` | number | Optional override for the ebb set (°true). Same sourcing as `floodDir` (CHS `ebbDirection`, NOAA `meanEbbDir`). |

### Example station config

Gillard Passage (CHS) and Boundary Pass (NOAA), drawn from our
[`currents-mcp`](https://github.com/sailingnaturali/currents-mcp) passage database:

```json
{
  "stations": [
    {
      "provider": "chs",
      "stationId": "5dd3064fe0fdc4b9b4be6978",
      "label": "Gillard Passage",
      "lat": 50.3933,
      "lon": -125.1567,
      "floodDir": 160,
      "ebbDir": 340
    },
    {
      "provider": "noaa",
      "stationId": "PUG1717",
      "noaaBin": 35,
      "label": "Boundary Pass",
      "lat": 48.6912,
      "lon": -123.2450,
      "floodDir": 110,
      "ebbDir": 290
    }
  ],
  "horizonDays": 3,
  "pollMinutes": 60
}
```

`floodDir` / `ebbDir` are the set (°true) you observe at the station on the flood and
ebb — fill them from a current atlas or pilot book for your stations.

## Output

### `environment.current` (delta)

```json
{ "drift": 1.23, "setTrue": 2.79 }
```

- `drift` — current speed in **m/s**.
- `setTrue` — direction the current sets **toward**, in **radians true**.

### `/currents` resource

Served at `/signalk/v2/api/resources/currents` (anonymously readable under
`allow_readonly`):

```json
{
  "stations": [
    {
      "stationId": "5dd3064fe0fdc4b9b4be6978",
      "label": "Gillard Passage",
      "lat": 50.3933,
      "lon": -125.1567,
      "floodDir": 95,
      "ebbDir": 275,
      "dirsSource": "api",
      "events": [
        { "utc": "2026-06-06T04:14:00.000Z", "kind": "slack", "speedKn": 0 },
        { "utc": "2026-06-06T05:40:00.000Z", "kind": "flood", "speedKn": 4.1 }
      ]
    }
  ]
}
```

`kind` is `slack` | `flood` | `ebb`; `speedKn` is the event speed magnitude in knots.
`floodDir` / `ebbDir` are the station's set directions in °true — so consumers can say
which way the water flows, not just when it turns. `dirsSource` says where they came
from: `"api"` (provider-published — CHS station metadata or NOAA-measured) or
`"config"`; absent means nobody knows. Config-sourced
directions may also carry `floodDirEstimated` / `ebbDirEstimated: true` when the config
value is an assumption (e.g. the reciprocal of a stated flood) — consumers should say so.

## Offline harmonic fallback

When the CHS or NOAA API is unreachable, stations with bundled public-domain NOAA
harmonic constituents fall back to offline synthesis via
[Neaps](https://github.com/neaps/neaps), so `environment.current` and `/currents`
keep flowing without a network connection.

### Provenance fields

Every reading carries two extra fields:

| Field | Values | Meaning |
|-------|--------|---------|
| `source` | `"chs"` \| `"noaa"` \| `"harmonic"` | Where this prediction came from. |
| `live` | `true` \| `false` | `false` when synthesized offline from constituents. |

A station flagged `requiresLive: true` in config (the strong narrows — Dent, Arran,
Seymour, Gillard, Hole in the Wall) is tagged `unreliableForTransit: true` whenever
it is served harmonic-only. The harmonic model gives a reasonable baseline for
planning, but constituent-derived slack timing at fast narrows can be off by tens of
minutes. **Do not use a harmonic-only reading to time a transit of the rapids.**
A deeper look at why harmonic predictions fall short at constricted passes will be
written up on the engineering blog when the model has been run against live data for
a season.

### Coverage and licensing

Only **NOAA US stations** have bundled constituents — Canadian/CHS data is not
included (licensing). Offline coverage is the US-Salish passes in the default gate
list (Boundary Pass, Admiralty Inlet, etc.); CHS gates (Dodd Narrows, Gillard, Dent,
Seymour, Arran, Porlier, Active, Beazley, Hole in the Wall) remain API-only.

### Discrepancy log

While a station has live data available, the plugin compares harmonic predictions
against the live values and appends mismatches to:

```
<SignalK dataDir>/signalk-currents-discrepancies.jsonl
```

This log is local only — nothing is phoned home. It is useful for diagnosing
constituent accuracy over time.

### Refreshing bundled constituents

```bash
npm run refresh:constituents
```

This re-fetches NOAA harmonic constituents for all NOAA stations in the default gate
list and overwrites `src/constituents.json`. Commit the result to update the bundle.

## Development

```bash
npm install
npm test      # vitest
npm run build # tsc -> dist/
```

## License

MIT © 2026 Bryan Clark
