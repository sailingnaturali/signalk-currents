# CHS Web Services (IWLS) — practical reference

The Canadian Hydrographic Service serves water levels and tidal currents from the
**Integrated Water Level System (IWLS)** REST API. The [official page][gc] links to
a Swagger spec that's accurate but hard to skim, so this is the working subset
`signalk-currents` actually uses, verified against the live API. Lessons learned
using it go at the bottom — add to that section rather than rediscovering them.

[gc]: https://tides.gc.ca/en/web-services-offered-canadian-hydrographic-service

Base URL: `https://api-sine.dfo-mpo.gc.ca/api/v1`

No auth, no key. All times are UTC (`...Z`). Public data.

### Rate & size limits

Per client IP:

- **3 requests/second**, **30 requests/minute**.
- Data span per request: **1 week** for 1-minute data, **3 weeks** for 3-minute,
  **1 month** for lower resolutions.

A **429** means you tripped one of these — back off and re-request within the limits.
Our per-station-day fetch (one small request each, cached, well under 30/min for the
default ~17 stations) stays clear, but a wide `horizonDays` × many stations on a cold
cache could brush the per-minute cap.

## Endpoints we use

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/stations` | List/search stations (see filters below) |
| GET | `/stations/{id}` | Station summary + available `timeSeries` |
| GET | `/stations/{id}/metadata` | Full metadata incl. `floodDirection`/`ebbDirection` |
| GET | `/stations/{id}/data?time-series-code=…&from=…&to=…` | Time-series data |

`{id}` is the 24-hex Mongo-style `id` (e.g. `<24-hex-id>`), **not** the
human station `code` (`"07487"`). Encode it as a single path segment.

### Finding a station id

There is no lookup-by-name-or-code endpoint; list and filter client-side. Region
code narrows it a lot (`PAC` = Pacific ≈ 369 stations vs. 1573 total):

```
GET /stations?chs-region-code=PAC
```

Each row carries `officialName`, `alternativeName`, `code`, `id`, `latitude`,
`longitude`, and a `timeSeries[]` array. Grep `officialName` for the pass you want,
take its `id`. (Our default station list in `src/defaults.ts` is already resolved.)

### Time-series codes

`/stations/{id}` and `/metadata` both return a `timeSeries[]` telling you which
products a station publishes. Current stations carry:

| Code | Meaning |
|------|---------|
| `wcp1-events` | Current **prediction events** — slack/flood/ebb turning points. **This is what we fetch.** |
| `wcsp1` | Water current speed predictions (continuous series) |
| `wcdp1` | Water current direction predictions (continuous series) |

(Water-level stations expose `wlo` observed, `wlp` predicted, `wlf` forecast, etc.
Not used here.) `data` returns `[]` for a code the station doesn't publish rather
than erroring, so always confirm the code is in `timeSeries[]` first.

### `wcp1-events` rows

```json
{ "eventDate": "2026-07-17T01:53:00Z", "qualifier": "SLACK",        "value": 0.0,   "qcFlagCode": "2", "reviewed": false }
{ "eventDate": "2026-07-17T05:12:00Z", "qualifier": "EXTREMA_EBB",  "value": 6.5,   "qcFlagCode": "2", "reviewed": false }
{ "eventDate": "2026-07-17T10:54:00Z", "qualifier": "EXTREMA_FLOOD","value": 4.844, "qcFlagCode": "2", "reviewed": false }
```

- `qualifier` → our event kind: `SLACK`→slack, `EXTREMA_FLOOD`→flood, `EXTREMA_EBB`→ebb.
  Ignore any other qualifier.
- `value` is peak rate in **knots** (0 at slack). Direction is **not** here — see metadata.
- `from`/`to` are inclusive-ish; we request one UTC day at a time (`from` 00:00Z,
  `to` next 00:00Z) and cache per day.

### Set directions (metadata, not the events feed)

The events feed carries only times and rates. Set directions live in station
metadata and are **static**, so fetch once and cache for the process lifetime:

```
GET /stations/{id}/metadata  →  { "floodDirection": 355, "ebbDirection": 155, ... }
```

°true. These are CHS's authoritative equivalent of NOAA's `meanFloodDir`/`meanEbbDir`.
`metadata` also has `chsRegionCode`, `code`, `classCode`, `isTidal`, `operating`,
`officialName`, lat/lon, and `stationOwner`.

## Lessons learned

Append here; each line is a scar so we don't repeat it.

- **`id` ≠ `code`.** The API keys on the 24-hex `id`. The friendly `"07487"` is
  display-only and won't resolve a path.
- **Directions aren't in `wcp1-events`.** They're in `/metadata` as
  `floodDirection`/`ebbDirection`, static, fetched separately (see `src/fetch.ts`).
- **No name/code search endpoint** — list a region and filter client-side.
- **`operating: false` is normal** for prediction-only stations (e.g. Dodd Narrows).
  It means no live sensor, not "no predictions" — the prediction time-series are
  still published. Don't filter on it.
- **Don't bundle CHS data offline.** CHS data isn't public-domain the way NOAA's is,
  so the harmonic fallback ships **only** NOAA constituents. CHS gates have no
  offline coverage by design (see `scripts/refresh-constituents.ts`).
- **Unknown qualifiers exist** in the events feed occasionally; skip anything not in
  the SLACK/EXTREMA_FLOOD/EXTREMA_EBB set rather than assuming three kinds.
- **429 = rate limit** (3/s, 30/min per IP). `fetchChsEvents` currently just throws
  `CHS 429` with no backoff — the day cache keeps us well under the cap, but if a cold
  cache with a large horizon × many stations starts tripping it, add spacing/retry there.
