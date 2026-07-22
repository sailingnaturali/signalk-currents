# @sailingnaturali/signalk-currents

A generic [SignalK](https://signalk.org/) server plugin that fetches tidal-current
predictions from the **CHS** (Canadian Hydrographic Service) and **NOAA** tides &
currents APIs for a configured list of current stations, and:

- publishes **`environment.current`** — the interpolated current (`drift` in m/s,
  `setTrue` in radians) at the vessel, using the nearest configured station; and
- serves a **`/currents`** resource — the full slack / flood / ebb event series for
  every configured station.

CHS gates are auto-loaded at runtime from the shared
[`@sailingnaturali/station-corrections`](https://github.com/sailingnaturali/station-corrections)
registry (no CHS ids ship in this repo); NOAA and any custom stations come from
plugin config.

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

For the CHS (IWLS) side, [`docs/chs-api.md`](docs/chs-api.md) is a practical reference
to the endpoints, time-series codes, and response shapes we use — plus lessons learned,
since the official docs are hard to parse.

Interpolation is a quarter-sine model between each slack (speed 0) and the adjacent
flood/ebb maximum: ramping up uses `Vmax·sin(π/2·frac)`, ramping down uses
`Vmax·cos(π/2·frac)`. `setTrue` is the extremum's set direction (the flood set when
flooding, the ebb set when ebbing).

## Configuration

Configured from the SignalK server plugin UI.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stations` | array | NOAA Boundary Pass; CHS gates auto-loaded from the registry | Current stations. |
| `horizonDays` | number | `3` | How many UTC days of predictions to fetch/keep. |
| `pollMinutes` | number | `60` | How often to refresh and republish. |

**Default stations.** The plugin ships only one config default, NOAA Boundary Pass
— CHS is Crown-copyright data and no CHS station id is committed to this repo. The
Salish Sea / Desolation Sound CHS gates (Dodd Narrows, Active/Porlier Passages,
Seymour Narrows, Beazley Passage, Hole in the Wall, Gillard Passage, Dent and Arran
Rapids, and more) are loaded automatically at runtime from the shared
[`@sailingnaturali/station-corrections`](https://github.com/sailingnaturali/station-corrections)
registry by name; each gate's live CHS station id is resolved from the IWLS
`/stations` index (under the operator's own CHS licence) only when fetching, never
persisted. Add entries to `stations` to override a registry gate or add your own
cruising ground. Set directions aren't baked into the defaults — both providers
publish them (CHS in station metadata, NOAA inline), so every gate gets an
authoritative `setTrue` fetched at runtime.

Each entry in `stations`:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `"chs"` \| `"noaa"` | Prediction source. |
| `stationId` | string | For CHS, the [`station-corrections`](https://github.com/sailingnaturali/station-corrections) registry key (e.g. `chs-active-pass`) — the live IWLS station id is resolved from that key at runtime, never configured. For NOAA, the NOAA station id (e.g. `PUG1717`). |
| `noaaBin` | number | NOAA current-station bin (NOAA only). |
| `label` | string | Human-readable name. |
| `lat` / `lon` | number | Station position (used for nearest-station selection). |
| `floodDir` | number | **Optional override** for the flood set (°true). Both providers publish this authoritatively — CHS as `floodDirection` in station metadata, NOAA as the measured `meanFloodDir` — and the fetched value wins. Configure it only for a station the provider doesn't cover. |
| `ebbDir` | number | Optional override for the ebb set (°true). Same sourcing as `floodDir` (CHS `ebbDirection`, NOAA `meanEbbDir`). |

### Example station config

The shipped NOAA default. CHS gates need no config at all — they're loaded
automatically from the [`station-corrections`](https://github.com/sailingnaturali/station-corrections)
registry:

```json
{
  "stations": [
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
      "stationId": "chs-gillard-passage",
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

Constituents include each station's Z0 mean-flow term (NOAA `majorMeanSpeed`) — the
Salish passes run −0.74..+0.30 kn of net drift, and omitting it skews slack timing.
Measured against NOAA's own predictions at Boundary Pass over three days: **7.4 min
mean / 21 min worst** on event timing, 0.07 kn on peak speed (`test/harmonic-oracle.test.ts`
gates this). Without Z0 the same comparison was 15.6 min mean / 55 min worst.

### Provenance fields

Every reading carries two extra fields:

| Field | Values | Meaning |
|-------|--------|---------|
| `source` | `"chs"` \| `"noaa"` \| `"harmonic"` | Where this prediction came from. |
| `live` | `true` \| `false` | `false` when synthesized offline from constituents. |

A station flagged `requiresLive: true` is tagged `unreliableForTransit: true`
whenever it is served harmonic-only. Every constricted CHS gate from the shared
registry is flagged this way by default (`src/registry-stations.ts`); only the two
open straits, Juan de Fuca East and Johnstone Strait Central, are exempt, since
their current is advisory speed-made-good rather than a transit slack window. This
is the safety-conservative default — a newly-added registry gate is flagged until
confirmed to be an open strait. The harmonic model gives a reasonable baseline for
planning, but constituent-derived slack timing at fast narrows can be off by tens of
minutes. **Do not use a harmonic-only reading to time a transit of the rapids.**
A deeper look at why harmonic predictions fall short at constricted passes will be
written up on the engineering blog when the model has been run against live data for
a season.

### Building offline CHS models

An operator with their own CHS licence can build a local harmonic model for the
CHS gates: SignalK Server → Webapps → this plugin has a **Build offline CHS
models** button. It runs the [`@sailingnaturali/chs-constituents`](https://github.com/sailingnaturali/chs-constituents)
pipeline against the live IWLS API (~30 minutes for the full gate list) and writes
the result to `<SignalK dataDir>/chs-constituents.json`.

That file contains CHS Crown-copyright IP. It is the operator's own data, for
personal, non-commercial use only — **do not redistribute it**, and it is
**NOT FOR NAVIGATION**.

### Coverage and licensing

**NOAA US stations** have bundled constituents shipped in this repo — nothing CHS
is shipped. **CHS gates get offline coverage only after the operator runs the
local build** above, under their own CHS licence; until then they're API-only.

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

This regenerates `data/harmonic-constituents.json` from NOAA via
[`@sailingnaturali/current-stations`](https://github.com/sailingnaturali/current-stations)
— the shared extractor, which handles the parts of NOAA's API that will otherwise
quietly hand you wrong data (`harcon` is empty at any bin but the station's `currbin`;
a reference is a `(station, bin)` pair; a `type: S` station with its own constituents
is predicted harmonically, not by offsets). Commit the result.

The generated DB is committed, so building the plugin never needs this.

## Development

```bash
npm install
npm test      # vitest
npm run build # tsc -> dist/
```

## License

MIT © 2026 Bryan Clark
