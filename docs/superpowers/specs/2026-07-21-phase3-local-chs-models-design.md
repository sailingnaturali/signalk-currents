# Phase 3: Local CHS Models, No Committed CHS Data — Design

**Date:** 2026-07-21
**Repos:** `signalk-currents` (primary) and `chs-constituents` (library prep)
**Do NOT touch:** `station-corrections`, `currents-mcp` (other sessions own them)

## Goal

Make `signalk-currents` ship **no Canadian (CHS) station data** on install, yet still:

- fetch **live** CHS currents when online, and
- gain a **new** capability — build CHS harmonic models **locally**, on the operator's
  machine, for **offline** Canadian current prediction.

The plugin joins locally-built models to the public `@sailingnaturali/station-corrections`
registry **by name/key**, never by CHS id.

## Hard invariant

**No CHS station id and no CHS-derived constituent may be committed to or published from
`signalk-currents`.** NOAA data is exempt (US-Government public domain). The bundled
`data/harmonic-constituents.json` (NOAA-only, 9 stations) stays. Any locally-built CHS
artifact carries the CHS attribution `NOTE` (exact wording from `chs-constituents/src/cli.ts`).

## Why the CHS id can't just be deleted

Today `src/defaults.ts` is the only place the plugin learns a CHS station's id, and that id
is what `fetchChsEvents`/`fetchChsDirections` use for **live** fetch. Removing it (per the
invariant) breaks the online path too. After Phase 3, for each CHS gate the plugin needs
three things at runtime, none committed:

| Need | Old source (deleted) | New source |
|------|----------------------|------------|
| name / position / label | `defaults.ts` | `@sailingnaturali/station-corrections` (by name/key, never `providerId`) |
| live CHS id (online fetch) | `defaults.ts` `stationId` | resolved live from IWLS `/stations` by name |
| offline constituents (NEW) | did not exist | operator-triggered `chs-constituents` build, in the data dir |

The `chs-constituents` output bundle deliberately omits the CHS id and carries no lat/lon, so
it cannot be the source of the live id or position — hence the registry join + live IWLS
resolution.

---

## Repo 1 — `chs-constituents` (make it a reusable library)

Decisions from `chs-constituents` are fixed; this repo already reads station **names**, not
ids (Phase 1). Publishing the *code* is licence-clean — the repo ships no CHS data.

### 1.1 Extract `buildBundle(options)`

- New **node-only** module `src/build.ts` exporting `buildBundle`. It encapsulates the
  orchestration currently inline in `cli.ts` `main()`: create `IwlsClient`, `resolveStations`,
  fit loop, assemble the bundle **including the `NOTE`** and validation metadata, and
  **return** the bundle object. The caller writes it to disk.
- `onProgress?: (message: string) => void` callback for per-station progress.
- Options mirror the CLI flags: `stationsFile?`, `only?: string[]`, `trainingDays`,
  `trainingStart`, `validateFrom?`, `validateDays`, `cacheDir`, `requestIntervalMs`,
  `userAgent?`, `onProgress?`.
- **Root export (`src/index.ts`) stays browser-safe** — `buildBundle` (fs + cache) is reached
  only via the subpath `@sailingnaturali/chs-constituents/build`. The "no node builtins in the
  root" comment is load-bearing (the constituent fitter runs in the browser too).
- `cli.ts` `main()` is refactored to: parse args → `buildBundle(...)` → `writeFile`. **External
  CLI behavior is unchanged** (verified by the existing CLI/`resolveStations` tests staying
  green). The `NOTE` constant moves into `build.ts` (or a shared module) so both callers get it.

### 1.2 Bump `station-corrections` to `^2.0.0`

- `@sailingnaturali/station-corrections` `^1.4.1 → ^2.0.0` (2.0.0 dropped `providerId`; code is
  already compatible). **Gated on 2.0.0 being published** (latest on npm is `1.5.0` as of
  2026-07-21) — install/CI stay red until then.

### 1.3 Publish-prep

- `package.json`: add the `./build` subpath to `exports`, confirm `files`, add
  `publishConfig.access: "public"` and a build-before-publish guard (`prepublishOnly`/`prepare`
  as appropriate). Scoped `@sailingnaturali/chs-constituents`, MIT, OIDC like the MCP servers.
- **`npm publish` is Bryan's go, not the agent's.**

---

## Repo 2 — `signalk-currents` (the phase)

### 2.1 Strip committed CHS data

- `src/defaults.ts`: remove all 19 CHS stations; keep only the NOAA Boundary Pass entry.
- Rewrite `test/defaults.test.ts`: assert `DEFAULT_STATIONS` is NOAA-only and carries no CHS
  `stationId`. Move the `requiresLive` choke-point assertions to the registry-derived list
  (see 2.3).

### 2.2 Live CHS id resolution (`src/sources/iwls-index.ts`)

- `GET https://api-iwls.dfo-mpo.gc.ca/.../stations`, filter to stations publishing a `wcsp1`
  series, shape to `{ id, officialName, latitude, longitude }` (mirrors the `chs-constituents`
  Phase 1 mechanism — small internal fetch, not a dependency for the online path).
- Resolve each registry gate's live CHS id **by normalized name**, cached in memory for the
  process; re-resolve at `start()` (and tolerate failure → offline).
- The resolved id is used **only** to fetch; it is never written to any file.

### 2.3 Registry-driven CHS station list

- Add `@sailingnaturali/station-corrections` `^2.0.0` dependency.
- Build the CHS gate list from the registry: `name`, `position` → `lat`/`lon`, `key` →
  identity. **Read `providerId` from nowhere.**
- `requiresLive` comes from a committed `STRONG_GATES` name set (the plugin's transit-safety
  judgment — no CHS id/constituent; e.g. `Seymour Narrows`, `Dent Rapids`, `Gillard Passage`,
  `Dodd Narrows`, `Active Pass`, and the rest of the previously-flagged narrows).
- Effective station list = config default `[NOAA Boundary Pass]` + registry CHS gates.
  Operator-added config stations still merge in.

### 2.4 Station identity refactor

- A CHS station's stable identity is its **registry key** (`chs-active-pass`); NOAA keeps its
  NOAA id (`PUG1717`). The live IWLS id is ephemeral (2.2).
- `series` map keys, the per-day cache key, `computeDiscrepancy`, and `harmonicStationFor`
  lookups all key on this **identity** rather than the raw `stationId`.

### 2.5 Offline build action (operator-triggered)

- Tiny bundled webapp `public/index.html`: one button + a progress area. Appears in the
  SignalK Webapps menu.
- Admin-gated `registerWithRouter` POST endpoint (e.g. `POST /plugins/signalk-currents/build`)
  runs `buildBundle({ onProgress → app.setPluginStatus / a status the webapp polls })` fitting
  **all ~30** live CHS current stations (chs-constituents' default; no filter to construct).
- On success: write the returned bundle to `<getDataDirPath()>/chs-constituents.json`, then
  hot-reload the harmonic DB (2.6). On failure: report in the webapp + plugin status and
  **leave any prior bundle untouched**.
- Admin-gating is correct here — this is an operator-only, ~30-minute network job, not
  anonymous data.
- The data dir is outside the repo and the npm package, so the built CHS artifact is never
  committed or shipped (invariant satisfied structurally).

### 2.6 Merged harmonic DB

- `loadHarmonicDb` loads the bundled NOAA file (keyed `PUG*`) **and**, if present, the
  data-dir CHS bundle (keyed by registry key), adapting fields:
  `floodDirection→floodDir`, `ebbDirection→ebbDir`, `offset→z0Kn`,
  `constituents[].amplitude→amplitudeKn`, `constituents[].phase→phaseDeg`.
- `harmonicStationFor(db, identity)` now resolves CHS gates too → CHS gates gain an **offline
  fallback**, the new capability. `unreliableForTransit` still fires when `requiresLive` and
  the reading is harmonic-only.
- The `NOTE` from the built bundle is retained (surfaced wherever provenance is shown).

### 2.7 Dependencies

- Add `@sailingnaturali/station-corrections@^2.0.0` and `@sailingnaturali/chs-constituents@^0.1.x`.
- Both **gated on publishing**; developed/tested against local `file:`/linked deps until then.
  Version pins go in now; installs/CI go green after publish.

---

## Data flow

- **Online:** registry gate → resolve live id (IWLS) → fetch events → serve live
  (`live: true`).
- **Offline:** registry gate → data-dir harmonic entry → synthesize → serve fallback
  (`live: false`, `unreliableForTransit` when `requiresLive`).
- `selectData` (live-preferred, harmonic fallback) is unchanged; CHS simply now has a harmonic
  arm to fall back to.

## Error handling

- Live id resolution fails (offline / IWLS down) → skip live for that gate, use fallback.
- Build failure → surfaced in webapp + `setPluginError`; prior bundle untouched.
- No built bundle yet → CHS gates behave as today (online-only; no offline fallback).
- Existing per-station try/catch isolation in `refresh()` is preserved — one bad gate never
  blanks the others.

## Testing (TDD)

- **chs-constituents:** `buildBundle` unit test (mock `IwlsClient`, assert bundle shape +
  `NOTE` + `onProgress` calls); existing `cli.ts` / `resolveStations` tests stay green.
- **signalk-currents:**
  - `iwls-index` resolver (wcsp1 filter, name→id, missing-name tolerance).
  - registry → station list (positions, key identity, `STRONG_GATES` → `requiresLive`).
  - harmonic adapter + merge (CHS bundle → `HarmonicStation`, lookup by registry key; NOAA
    unaffected).
  - `defaults.test.ts` rewrite (NOAA-only, no CHS id).
  - POST build handler (mocked `buildBundle`, writes data dir, reloads).

## Risks / sequencing

1. **Blocked on** `station-corrections@2.0.0` and `chs-constituents` publish (Bryan's go).
   Build/test against local links; CI green after publish.
2. **`api-sine` vs `api-iwls` id namespace** — the plugin's live event fetch uses
   `api-sine.dfo-mpo.gc.ca`, while station listing/`wcsp1` is on `api-iwls.dfo-mpo.gc.ca`.
   **Verify first thing** that an IWLS station id fetches correctly against `api-sine`. If the
   namespaces differ, move the live CHS event fetch to IWLS (`wcp1-events`) too. This is a
   one-request smoke test, done before wiring the online path.
