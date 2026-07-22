# Phase 3: Local CHS Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip all committed CHS station data from `signalk-currents` while keeping live CHS (ids resolved live from IWLS by name) and adding an operator-triggered offline build of CHS harmonic models via a reusable `chs-constituents` `buildBundle`.

**Architecture:** `chs-constituents` gains a node-only `buildBundle(options)` (subpath export `./build`). `signalk-currents` ships only the NOAA station; its CHS gate list comes from `@sailingnaturali/station-corrections` (by name/key, never `providerId`), each gate's live CHS id is resolved from IWLS at runtime for fetching only, and a webapp button runs `buildBundle` into the SignalK data dir to give offline CHS prediction. A CHS gate's stable identity is its registry key; the built bundle is keyed by that key and merges into the existing harmonic lookup.

**Tech Stack:** TypeScript (CJS plugin, `export =`; ESM chs-constituents, `type: module`), vitest, `@signalk/server-api`, Node ≥ 18 (global `fetch`).

## Global Constraints

- **HARD INVARIANT:** no CHS station id and no CHS-derived constituent may be committed to or published from `signalk-currents`. NOAA data (`data/harmonic-constituents.json`, 9 stations) is exempt (US-Government public domain).
- **Never read `providerId`** from the registry — `station-corrections@2.0.0` drops it; join CHS gates by **name/key** only.
- **Preserve the CHS attribution `NOTE`** (exact wording in `chs-constituents/src/cli.ts`) on any locally-built artifact.
- **Two publishes gate install/CI** (Bryan's go, not the agent's): `station-corrections@2.0.0` (by 07-25) then `chs-constituents` (by 07-28). Until both land, the two new plugin deps resolve only via local links; stage the version pins and verify with `npm run build` + `vitest` against linked/1.5.0 deps.
- **Repos:** Tasks 1–2 are in `~/src/sailingnaturali/chs-constituents`; Tasks 3–10 are in `~/src/sailingnaturali/signalk-currents` (branch `phase3-local-chs-models`). Commit in the repo the task names. Do NOT touch `station-corrections` or `currents-mcp`.
- **Commit trailer** (studio policy — commit & push completed work): end every commit body with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T`.

---

### Task 1: Extract `buildBundle` into a node-only module (chs-constituents)

**Repo:** `chs-constituents`

**Files:**
- Create: `src/build.ts` (owns `NOTE`, `fileCache`, `resolveStations`, `buildBundle`)
- Modify: `src/cli.ts` (import `buildBundle`; re-export `resolveStations`; thin `main()`)
- Test: `test/build.test.ts` (create)

**Interfaces:**
- Consumes: `IwlsClient`, `ChunkCache` (`src/client.js`); `fitStation`, `FittedStation`, `StationRef` (`src/pipeline.js`); `registryOverlay`, `stationsFromApi` (`src/registry.js`); `MATCH_WINDOW_MIN` (`src/validate.js`).
- Produces:
  - `export const NOTE: string`
  - `export function fileCache(dir: string): ChunkCache`
  - `export async function resolveStations(client: IwlsClient, opts: { stationsFile?: string; only: string[] }): Promise<StationRef[]>` (moved verbatim from `cli.ts`)
  - `export interface BuildBundleOptions { stationsFile?: string; only?: string[]; trainingDays?: number; trainingStart?: string; validateFrom?: string; validateDays?: number; cacheDir?: string; requestIntervalMs?: number; userAgent?: string; onProgress?: (message: string) => void }`
  - `export async function buildBundle(opts?: BuildBundleOptions): Promise<Record<string, unknown>>` — returns the assembled bundle (with `note`, `stations`, validation metadata); throws `Error("No stations were fitted")` when nothing fits, so a caller never overwrites good output with an empty bundle.

- [ ] **Step 1: Write the failing test**

Create `test/build.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildBundle, NOTE } from "../src/build.js";
import * as pipeline from "../src/pipeline.js";
import { IwlsClient } from "../src/client.js";

function clientWith(stations: unknown[]): IwlsClient {
  const c = new IwlsClient({ requestIntervalMs: 0 });
  (c as unknown as { stations: () => Promise<unknown> }).stations = async () => stations;
  return c;
}

describe("buildBundle", () => {
  it("fits the resolved stations and returns a bundle carrying the CHS NOTE", async () => {
    const client = clientWith([
      { id: "abc", officialName: "Somewhere New", latitude: 0, longitude: 0, operating: true },
    ]);
    const fit = vi.spyOn(pipeline, "fitStation").mockResolvedValue({
      id: "somewhere-new", name: "Somewhere New", type: "harmonic",
      floodDirection: 100, ebbDirection: 280, offset: 0, constituents: [],
    } as never);
    const progress: string[] = [];

    const bundle = await buildBundle({
      client, // injected below via opts? No — see impl: client built from opts.
    } as never).catch((e) => e);

    // buildBundle builds its own client from opts; drive it via a stubbed module instead.
    fit.mockRestore();
    expect(NOTE).toContain("NOT FOR NAVIGATION");
  });
});
```

> Note: `buildBundle` constructs its own `IwlsClient` from `opts` (it is the orchestrator). To keep the test hermetic without a network, stub `IwlsClient.prototype.stations` and `fitStation`. Rewrite the test body to:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildBundle, NOTE } from "../src/build.js";
import * as pipeline from "../src/pipeline.js";
import { IwlsClient } from "../src/client.js";

afterEach(() => vi.restoreAllMocks());

describe("buildBundle", () => {
  it("fits resolved stations, carries the NOTE, and reports progress", async () => {
    vi.spyOn(IwlsClient.prototype, "stations").mockResolvedValue([
      { id: "abc", officialName: "Somewhere New", latitude: 0, longitude: 0, operating: true },
    ] as never);
    vi.spyOn(pipeline, "fitStation").mockResolvedValue({
      id: "somewhere-new", name: "Somewhere New", type: "harmonic",
      floodDirection: 100, ebbDirection: 280, offset: 0, constituents: [],
    } as never);
    const progress: string[] = [];

    const bundle = await buildBundle({ cacheDir: ".cache-test", onProgress: (m) => progress.push(m) });

    expect((bundle as { note: string }).note).toBe(NOTE);
    expect((bundle as { stations: unknown[] }).stations).toHaveLength(1);
    expect(progress.some((m) => m.includes("Somewhere New"))).toBe(true);
  });

  it("throws when nothing fits, so a caller won't overwrite good output", async () => {
    vi.spyOn(IwlsClient.prototype, "stations").mockResolvedValue([
      { id: "abc", officialName: "Somewhere New", latitude: 0, longitude: 0, operating: true },
    ] as never);
    vi.spyOn(pipeline, "fitStation").mockResolvedValue(null as never);
    await expect(buildBundle({ cacheDir: ".cache-test" })).rejects.toThrow(/No stations were fitted/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/src/sailingnaturali/chs-constituents && npx vitest run test/build.test.ts`
Expected: FAIL — `Cannot find module "../src/build.js"`.

- [ ] **Step 3: Create `src/build.ts`**

```ts
// Node-only build orchestration: resolve the live station list, fit each, and
// assemble the bundle. Deliberately OUT of the browser-safe root export
// (src/index.ts reaches no node builtins) — this touches fs, cache and network.
// signalk-currents imports it via the "./build" subpath to run the fit in-process.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IwlsClient, type ChunkCache } from "./client.js";
import { fitStation, type FittedStation, type StationRef } from "./pipeline.js";
import { registryOverlay, stationsFromApi } from "./registry.js";
import { MATCH_WINDOW_MIN } from "./validate.js";

export const NOTE =
  "Derived from CHS IWLS predictions for personal, non-commercial use. Contains " +
  "Canadian Hydrographic Service intellectual property; Crown copyright is retained " +
  "by His Majesty the King in Right of Canada. NOT FOR NAVIGATION. Do not " +
  "redistribute — see README.md.";

export function fileCache(dir: string): ChunkCache {
  return {
    async read(key) {
      try {
        return await readFile(join(dir, key), "utf8");
      } catch {
        return null;
      }
    },
    async write(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, key), value);
    },
  };
}

/**
 * The station list to fit. Defaults to every live CHS current station from the
 * IWLS index, names/keys overlaid from the shared registry; `stationsFile` takes
 * a `{id,label}[]` file instead; `only` filters by overlaid-label substring.
 */
export async function resolveStations(
  client: IwlsClient,
  opts: { stationsFile?: string; only: string[] },
): Promise<StationRef[]> {
  let stations: StationRef[];
  if (opts.stationsFile) {
    stations = JSON.parse(await readFile(opts.stationsFile, "utf8"));
  } else {
    const overlay = registryOverlay();
    stations = stationsFromApi(await client.stations(), overlay);
    const matchedKeys = new Set(stations.map((s) => s.key).filter(Boolean));
    for (const { key } of overlay.values()) {
      if (!matchedKeys.has(key)) {
        console.error(`registry gate ${key} found no live IWLS station (name drift?)`);
      }
    }
  }
  if (!stations.length) {
    throw new Error(
      opts.stationsFile
        ? `No stations in ${opts.stationsFile}`
        : "No current stations returned by IWLS (check network / api-iwls.dfo-mpo.gc.ca)",
    );
  }
  if (opts.only.length) {
    stations = stations.filter((s) => opts.only.some((w) => s.label.toLowerCase().includes(w)));
    if (!stations.length) throw new Error("No stations matched --only");
  }
  return stations;
}

export interface BuildBundleOptions {
  stationsFile?: string;
  only?: string[];
  trainingDays?: number;
  trainingStart?: string;
  validateFrom?: string;
  validateDays?: number;
  cacheDir?: string;
  requestIntervalMs?: number;
  userAgent?: string;
  onProgress?: (message: string) => void;
}

export async function buildBundle(opts: BuildBundleOptions = {}): Promise<Record<string, unknown>> {
  const {
    stationsFile, only = [],
    trainingDays = 210, trainingStart = "2025-07-01",
    validateFrom, validateDays = 7,
    cacheDir = ".cache", requestIntervalMs = 2500,
    userAgent = "chs-constituents/1.0", onProgress = () => {},
  } = opts;

  const client = new IwlsClient({
    cache: fileCache(cacheDir),
    requestIntervalMs,
    userAgent,
    onProgress: (message) => onProgress(`  ${message}`),
  });

  const stations = await resolveStations(client, { stationsFile, only });

  const start = new Date(`${trainingStart}T00:00:00Z`);
  const fitted: FittedStation[] = [];
  for (const station of stations) {
    onProgress(`${station.label} …`);
    try {
      const result = await fitStation(client, station, {
        start,
        days: trainingDays,
        validateFrom: validateFrom ? new Date(`${validateFrom}T00:00:00Z`) : undefined,
        validateDays,
        onProgress: (message) => onProgress(message),
      });
      if (result) fitted.push(result);
    } catch (error) {
      onProgress(`  FAILED: ${(error as Error).message}`);
    }
  }

  if (!fitted.length) throw new Error("No stations were fitted");

  const generated = new Date().toISOString().slice(0, 10);
  const bundle: Record<string, unknown> = { note: NOTE, generated, trainingDays, trainingStart };
  if (validateFrom) {
    bundle.validationSource =
      `chs-constituents (automated), ${generated}, ` +
      `out-of-sample ${validateFrom}+${validateDays}d vs CHS wcp1-events`;
    bundle.validationNote =
      "median is the median absolute timing error over CHS extrema only, vs the " +
      `nearest same-kind predicted event (cap ${MATCH_WINDOW_MIN} min); slack timing ` +
      "is slackMedian, never pooled into the headline. Direction is tested as the " +
      "sign of modelled velocity at CHS extremum times. Tiers judge extremum timing.";
  }
  bundle.stations = fitted;
  return bundle;
}
```

- [ ] **Step 4: Refactor `src/cli.ts` to use `buildBundle`**

Replace the top-of-file `NOTE`, `fileCache`, and `resolveStations` definitions (lines ~10–76) with imports and a re-export, and slim `main()`. New `cli.ts`:

```ts
#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildBundle } from "./build.js";

// Re-exported so the Phase 1 test (test/resolve-stations.test.ts) keeps importing
// it from "./cli.js" while the implementation now lives in build.ts.
export { resolveStations } from "./build.js";

function arg(argv: string[], name: string, fallback?: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help")) {
    console.log(
      `chs-constituents — fit tidal-current constituents from CHS IWLS predictions.

You must run this yourself; the output cannot be redistributed. See README.md.

  --stations <path>       JSON list of {id, label} to fit instead of the live
                          IWLS index (default: every live CHS current station,
                          names improved via @sailingnaturali/station-corrections)
  --output <path>         Bundle path (default: currents.json)
  --training-days <n>     Series length (default: 210 — see Rayleigh note in pipeline.ts)
  --training-start <date> UTC start, YYYY-MM-DD (default: 2025-07-01)
  --validate-from <date>  UTC date to begin out-of-sample validation
  --validate-days <n>     Validation window (default: 7)
  --cache-dir <path>      Where to cache fetched chunks (default: .cache)
  --request-interval <s>  Seconds between requests (default: 2.5)
  --only <text>           Only stations whose label contains this (repeatable)`,
    );
    return 0;
  }

  const outputPath = arg(argv, "output", "currents.json")!;
  const only = argv.reduce<string[]>((acc, value, i) => {
    if (value === "--only") acc.push(argv[i + 1].toLowerCase());
    return acc;
  }, []);

  let bundle: Record<string, unknown>;
  try {
    bundle = await buildBundle({
      stationsFile: arg(argv, "stations"),
      only,
      trainingDays: Number(arg(argv, "training-days", "210")),
      trainingStart: arg(argv, "training-start", "2025-07-01")!,
      validateFrom: arg(argv, "validate-from"),
      validateDays: Number(arg(argv, "validate-days", "7")),
      cacheDir: arg(argv, "cache-dir", ".cache")!,
      requestIntervalMs: Number(arg(argv, "request-interval", "2.5")) * 1000,
      onProgress: (message) => console.error(message),
    });
  } catch (e) {
    console.error((e as Error).message);
    console.error("No stations were fitted — leaving the existing output untouched");
    return 1;
  }

  await writeFile(outputPath, JSON.stringify(bundle, null, 2));
  console.error(`\nwrote ${outputPath} — ${(bundle.stations as unknown[]).length} stations`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
```

- [ ] **Step 5: Run the test to verify it passes, plus the full suite + build**

Run: `cd ~/src/sailingnaturali/chs-constituents && npx vitest run test/build.test.ts && npm test && npm run build`
Expected: `build.test.ts` PASS (2); full suite PASS (including the unchanged `resolve-stations.test.ts` importing `resolveStations` from `cli.js`); `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd ~/src/sailingnaturali/chs-constituents
git add src/build.ts src/cli.ts test/build.test.ts
git commit -m "feat(build): extract buildBundle for programmatic use

Extract the resolve-stations → fit → assemble-bundle orchestration out of the
CLI into a node-only src/build.ts (subpath export ./build in Task 2), so
signalk-currents can run the fit in-process. cli.ts main() now calls it. Root
export stays browser-safe.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 2: Publish-prep + `station-corrections@2.0.0` bump (chs-constituents)

**Repo:** `chs-constituents`

> **GATE:** the `^2.0.0` bump can only be `npm install`ed once `station-corrections@2.0.0` is published (latest on npm is `1.5.0` as of 2026-07-21). Stage the edits; verify `npm run build && npm test` still pass against the currently-installed registry data. If install fails resolving `^2.0.0`, that is the gate, not a regression — record it and move on; re-verify after the publish lands.

**Files:**
- Modify: `package.json` (`exports` add `./build`; `dependencies` bump; `publishConfig`)

**Interfaces:**
- Produces: the `@sailingnaturali/chs-constituents/build` subpath resolving to `dist/build.js`, and a publish-ready package.

- [ ] **Step 1: Add the `./build` subpath export and publish config**

Edit `package.json`:

```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./build": { "types": "./dist/build.d.ts", "import": "./dist/build.js" }
  },
  "publishConfig": { "access": "public" },
```

- [ ] **Step 2: Bump the registry dependency**

In `package.json` `dependencies`, change:

```json
    "@sailingnaturali/station-corrections": "^2.0.0"
```

- [ ] **Step 3: Verify the build still typechecks and the subpath resolves**

Run: `cd ~/src/sailingnaturali/chs-constituents && npm run build && npm test`
Expected: `tsc` clean, tests PASS. (If `npm install`/CI can't resolve `^2.0.0` yet, that is the publish gate — note it; the local `node_modules` still has a compatible registry for the tests.)

- [ ] **Step 4: Commit**

```bash
cd ~/src/sailingnaturali/chs-constituents
git add package.json
git commit -m "chore: publish-prep — ./build subpath, public access, station-corrections ^2.0.0

npm publish is gated on station-corrections@2.0.0 (breaking, Bryan's go).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 3: Verify the IWLS↔api-sine id namespace (signalk-currents)

**Repo:** `signalk-currents`

> This retires the top design risk before any online-path code is written. The plugin fetches live events from `api-sine.dfo-mpo.gc.ca`, but resolves ids from `api-iwls.dfo-mpo.gc.ca`. They must share the 24-hex station-id namespace.

**Files:**
- Create: `scripts/verify-id-namespace.mjs` (throwaway probe; committed as a record)

- [ ] **Step 1: Write the probe**

Create `scripts/verify-id-namespace.mjs`:

```js
// One-shot: resolve a known gate's id from IWLS, then fetch its events from the
// plugin's api-sine endpoint with that same id. If api-sine returns rows, the two
// APIs share the id namespace and the plugin's existing chs.ts needs no change.
const IWLS = "https://api-iwls.dfo-mpo.gc.ca/api/v1";
const SINE = "https://api-sine.dfo-mpo.gc.ca/api/v1";

const stations = await (await fetch(`${IWLS}/stations`)).json();
const dodd = stations.find((s) => s.officialName === "Dodd Narrows");
if (!dodd) throw new Error("Dodd Narrows not in IWLS index");
console.log("IWLS id:", dodd.id);

const from = new Date();
const to = new Date(from.getTime() + 2 * 86400000);
const params = new URLSearchParams({
  "time-series-code": "wcp1-events",
  from: from.toISOString().replace(/\.\d{3}Z$/, "Z"),
  to: to.toISOString().replace(/\.\d{3}Z$/, "Z"),
});
const resp = await fetch(`${SINE}/stations/${dodd.id}/data?${params}`);
console.log("api-sine status:", resp.status);
const rows = resp.ok ? await resp.json() : [];
console.log("api-sine rows:", Array.isArray(rows) ? rows.length : rows);
console.log(rows.length > 0 ? "PASS: shared id namespace" : "FAIL: ids differ — move event fetch to IWLS");
```

- [ ] **Step 2: Run it**

Run: `cd ~/src/sailingnaturali/signalk-currents && node scripts/verify-id-namespace.mjs`
Expected: prints an IWLS id, `api-sine status: 200`, a positive row count, and `PASS: shared id namespace`.

- [ ] **Step 3: Branch on the result**

- **PASS** → proceed; `chs.ts` is unchanged, only the id source changes (Task 6).
- **FAIL** → STOP and escalate to Bryan: live CHS event fetch must move from `api-sine` to IWLS `wcp1-events` (rework `src/sources/chs.ts` + `test/chs.test.ts` to the IWLS base and response shape). This is a scope change; do not proceed silently.

- [ ] **Step 4: Commit the probe**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add scripts/verify-id-namespace.mjs
git commit -m "chore: probe confirming IWLS ids fetch against api-sine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 4: Live CHS id resolver from IWLS (signalk-currents)

**Repo:** `signalk-currents`

**Files:**
- Create: `src/sources/iwls-index.ts`
- Test: `test/iwls-index.test.ts` (create)

**Interfaces:**
- Produces:
  - `export interface IwlsStation { id: string; officialName: string; latitude: number; longitude: number }`
  - `export function currentStations(raw: RawStation[]): IwlsStation[]` — keeps only `wcsp1` publishers
  - `export function normalizeName(name: string): string`
  - `export async function resolveLiveIds(fetchFn?: typeof fetch): Promise<Map<string, string>>` — `normalizedName → live IWLS id`

- [ ] **Step 1: Write the failing test**

Create `test/iwls-index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { currentStations, normalizeName, resolveLiveIds } from '../src/sources/iwls-index';

const RAW = [
  { id: 'wl1', officialName: 'Tasiujaq', latitude: 58.7, longitude: -69.8, timeSeries: [{ code: 'wlo' }] },
  { id: 'cur1', officialName: 'Dodd Narrows', latitude: 49.13, longitude: -123.81, timeSeries: [{ code: 'wcsp1' }, { code: 'wcdp1' }] },
  { id: 'cur2', officialName: 'JUAN DE FUCA - EAST', latitude: 48.23, longitude: -123.53, timeSeries: [{ code: 'wcsp1' }] },
];

describe('currentStations', () => {
  it('keeps only wcsp1 publishers', () => {
    expect(currentStations(RAW as never).map((s) => s.id)).toEqual(['cur1', 'cur2']);
  });
  it('survives a missing timeSeries array', () => {
    expect(currentStations([{ id: 'x', officialName: 'X', latitude: 0, longitude: 0 }] as never)).toEqual([]);
  });
});

describe('normalizeName', () => {
  it('folds case, punctuation and spacing', () => {
    expect(normalizeName('JUAN DE FUCA - EAST')).toBe('juan de fuca east');
    expect(normalizeName('Dodd Narrows')).toBe('dodd narrows');
  });
});

describe('resolveLiveIds', () => {
  it('maps normalized name -> live id for current stations only', async () => {
    const fetchFn = (async () => ({ ok: true, json: async () => RAW })) as unknown as typeof fetch;
    const map = await resolveLiveIds(fetchFn);
    expect(map.get('dodd narrows')).toBe('cur1');
    expect(map.get('juan de fuca east')).toBe('cur2');
    expect(map.has('tasiujaq')).toBe(false);
  });
  it('throws on a non-ok response', async () => {
    const fetchFn = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(resolveLiveIds(fetchFn)).rejects.toThrow(/IWLS 503/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/iwls-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/sources/iwls-index.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/iwls-index.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/sources/iwls-index.ts test/iwls-index.test.ts
git commit -m "feat(iwls): resolve live CHS station ids from IWLS by name

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 5: Registry-driven CHS station list (signalk-currents)

**Repo:** `signalk-currents`

> **GATE:** needs `@sailingnaturali/station-corrections` installed. Pin `^2.0.0` in `package.json` (Task 10), but for local dev install the available build — `npm install @sailingnaturali/station-corrections@1.5.0` (its `registry.json` already carries the 19 CHS gates with `name`/`position`; the code below reads only those, never `providerId`, so 1.5.0 and 2.0.0 behave identically here). Re-verify against 2.0.0 after it publishes.

**Files:**
- Create: `src/registry-stations.ts`
- Test: `test/registry-stations.test.ts` (create)
- Modify: `src/types.ts` (add `liveId?` — see Task 6; if doing Task 5 first, add it here)

**Interfaces:**
- Consumes: `StationConfig` (`src/types`).
- Produces:
  - `export const STRONG_GATES: Set<string>` — labels the plugin judges unsafe for offline transit
  - `export function registryChsStations(data?: RegistryData): StationConfig[]` — one `StationConfig` per CHS registry gate: `provider:'chs'`, `stationId` = registry **key**, `label`/`lat`/`lon` from the entry, `requiresLive` from `STRONG_GATES`, `floodDir`/`ebbDir` unset.

- [ ] **Step 1: Write the failing test**

Create `test/registry-stations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { registryChsStations, STRONG_GATES } from '../src/registry-stations';

const DATA = {
  'chs-dodd-narrows': { name: 'Dodd Narrows', position: [49.13, -123.81], provider: 'chs' },
  'chs-porlier-pass': { name: 'Porlier Pass', position: [49.01, -123.58], provider: 'chs' },
  'noaa-boundary-pass': { name: 'Boundary Pass', position: [48.69, -123.24], provider: 'noaa' },
};

describe('registryChsStations', () => {
  it('emits a StationConfig per CHS gate, keyed by the registry key, NOAA excluded', () => {
    const out = registryChsStations(DATA as never);
    expect(out.map((s) => s.stationId)).toEqual(['chs-dodd-narrows', 'chs-porlier-pass']);
    const dodd = out[0];
    expect(dodd).toMatchObject({ provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows', lat: 49.13, lon: -123.81 });
    expect(dodd.floodDir).toBeUndefined();
    expect(dodd.ebbDir).toBeUndefined();
  });

  it('flags requiresLive from STRONG_GATES by label', () => {
    const out = registryChsStations(DATA as never);
    const byLabel = Object.fromEntries(out.map((s) => [s.label, s]));
    expect(byLabel['Dodd Narrows'].requiresLive).toBe(true);   // strong
    expect(byLabel['Porlier Pass'].requiresLive).toBeUndefined(); // not strong
  });

  it('STRONG_GATES covers the known narrows', () => {
    for (const g of ['Seymour Narrows', 'Dent Rapids', 'Gillard Passage', 'Dodd Narrows', 'Active Pass']) {
      expect(STRONG_GATES.has(g)).toBe(true);
    }
  });

  it('reads the real bundled registry (guards a silent rename)', async () => {
    const out = registryChsStations();
    expect(out.length).toBeGreaterThanOrEqual(19);
    expect(out.find((s) => s.label === 'Dodd Narrows')?.stationId).toBe('chs-dodd-narrows');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/registry-stations.test.ts`
Expected: FAIL — module not found (and/or `station-corrections` not installed → install it first, see the GATE).

- [ ] **Step 3: Implement `src/registry-stations.ts`**

```ts
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

interface RegistryEntry { name: string; position: [number, number]; provider: string; }
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
```

> **tsconfig note:** importing `registry.json` needs `"resolveJsonModule": true` in `tsconfig.json`. If `npm run build` errors on the JSON import, add it under `compilerOptions` (and `esModuleInterop` is already on).

- [ ] **Step 4: Run the test + build**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/registry-stations.test.ts && npm run build`
Expected: PASS (4); `tsc` clean (add `resolveJsonModule` if needed).

- [ ] **Step 5: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/registry-stations.ts test/registry-stations.test.ts tsconfig.json
git commit -m "feat(registry): derive the CHS gate list from station-corrections by name

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 6: Station identity — `liveId` for CHS fetch (signalk-currents)

**Repo:** `signalk-currents`

> `stationId` becomes the stable identity (registry key for CHS, NOAA id for NOAA). CHS live fetch must use the ephemeral IWLS id instead. Add `liveId` and make the CHS fetchers read it.

**Files:**
- Modify: `src/types.ts` (add `liveId?: string`)
- Modify: `src/fetch.ts` (CHS fetchers use `station.liveId`)
- Test: `test/fetch.test.ts` (extend)

**Interfaces:**
- Consumes: `StationConfig` (now with `liveId?: string`).
- Produces: CHS fetch keyed on `liveId`; a CHS station with no `liveId` throws `Error("no live id for <label>")` (caught upstream → harmonic fallback).

- [ ] **Step 1: Write the failing test**

Add to `test/fetch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { stationData } from '../src/fetch';
import { StationConfig } from '../src/types';
import * as chs from '../src/sources/chs';

describe('CHS fetch uses liveId, not the stable stationId', () => {
  const base: StationConfig = {
    provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows', lat: 49.13, lon: -123.81,
  };

  it('passes station.liveId to the CHS events fetcher', async () => {
    const spy = vi.spyOn(chs, 'fetchChsEvents').mockResolvedValue([]);
    vi.spyOn(chs, 'fetchChsDirections').mockResolvedValue({ floodDir: 100, ebbDir: 280 });
    await stationData({ ...base, liveId: 'IWLS123' }, new Date('2026-07-01T00:00:00Z'), 1, new Map());
    expect(spy.mock.calls[0][0]).toBe('IWLS123');
    vi.restoreAllMocks();
  });

  it('throws when a CHS station has no liveId', async () => {
    await expect(
      stationData(base, new Date('2026-07-01T00:00:00Z'), 1, new Map()),
    ).rejects.toThrow(/no live id for Dodd Narrows/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/fetch.test.ts`
Expected: FAIL — `liveId` not on the type / current code passes `stationId`.

- [ ] **Step 3: Add `liveId` to `StationConfig`**

In `src/types.ts`, inside `StationConfig`, after `requiresLive?: boolean;`:

```ts
  // Ephemeral IWLS station id for a CHS gate, resolved live at runtime (see
  // resolveLiveIds). NEVER committed. `stationId` above is the stable identity
  // (registry key for CHS); `liveId` is only the fetch handle.
  liveId?: string;
```

- [ ] **Step 4: Make the CHS fetchers use `liveId`**

In `src/fetch.ts`, replace `defaultFetcher` and `defaultDirFetcher`:

```ts
const chsLiveId = (s: StationConfig): string => {
  if (!s.liveId) throw new Error(`no live id for ${s.label}`);
  return s.liveId;
};

const defaultFetcher: DayFetcher = async (s, a, b) =>
  s.provider === 'chs'
    ? { events: await fetchChsEvents(chsLiveId(s), a, b) }
    : fetchNoaaEvents(s.stationId, s.noaaBin ?? 0, a, b);

const defaultDirFetcher: DirFetcher = (s) =>
  s.provider === 'chs' ? fetchChsDirections(chsLiveId(s)) : Promise.resolve({});
```

> The in-memory cache key stays `${provider}:${stationId}:${day}` — `stationId` is the stable registry key, so cached CHS days survive a liveId re-resolution. No cache-key change needed.

- [ ] **Step 5: Run the test to verify it passes, plus the suite**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/fetch.test.ts && npm run build`
Expected: PASS; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/types.ts src/fetch.ts test/fetch.test.ts
git commit -m "feat(fetch): CHS live fetch keyed on ephemeral liveId, not the identity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 7: Load & merge the locally-built CHS harmonic bundle (signalk-currents)

**Repo:** `signalk-currents`

> The built bundle (chs-constituents output, in the data dir) uses a different field shape than the bundled NOAA DB. Adapt it and merge, keyed by registry key.

**Files:**
- Modify: `src/sources/harmonic.ts` (`loadHarmonicDb` gains an optional CHS-bundle path; add `adaptChsBundle`)
- Test: `test/harmonic-chs.test.ts` (create)

**Interfaces:**
- Consumes: the chs-constituents bundle shape `{ stations: { id, name, floodDirection, ebbDirection, offset, constituents: {name,amplitude,phase}[] }[] }`.
- Produces:
  - `export function adaptChsBundle(bundle: unknown): Record<string, HarmonicStation>` — keyed by station `id` (registry key)
  - `loadHarmonicDb(file?, chsBundlePath?)` merges NOAA (bundled) + CHS (data dir) stations; CHS entries key by registry key, NOAA by NOAA id.

- [ ] **Step 1: Write the failing test**

Create `test/harmonic-chs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { adaptChsBundle, loadHarmonicDb, harmonicStationFor } from '../src/sources/harmonic';

const CHS_BUNDLE = {
  note: 'Contains information licensed under the Canadian Hydrographic Service ... NOT FOR NAVIGATION.',
  stations: [
    {
      id: 'chs-dodd-narrows', name: 'Dodd Narrows', type: 'harmonic',
      floodDirection: 130, ebbDirection: 310, offset: -0.2,
      constituents: [{ name: 'M2', amplitude: 2.1, phase: 45 }, { name: 'K1', amplitude: 0.8, phase: 200 }],
    },
  ],
};

describe('adaptChsBundle', () => {
  it('maps the CHS field names into HarmonicStation, keyed by registry key', () => {
    const out = adaptChsBundle(CHS_BUNDLE);
    expect(out['chs-dodd-narrows']).toEqual({
      floodDir: 130, ebbDir: 310, z0Kn: -0.2,
      constituents: [{ name: 'M2', amplitudeKn: 2.1, phaseDeg: 45 }, { name: 'K1', amplitudeKn: 0.8, phaseDeg: 200 }],
    });
  });
});

describe('loadHarmonicDb merge', () => {
  it('serves both bundled NOAA and data-dir CHS stations by their own keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chsdb-'));
    const chsPath = join(dir, 'chs-constituents.json');
    writeFileSync(chsPath, JSON.stringify(CHS_BUNDLE));
    const db = loadHarmonicDb(undefined, chsPath);
    expect(harmonicStationFor(db, 'chs-dodd-narrows')?.floodDir).toBe(130); // CHS, by registry key
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();                 // bundled NOAA still present
  });

  it('is a no-op for a missing CHS bundle path', () => {
    const db = loadHarmonicDb(undefined, join(tmpdir(), 'does-not-exist.json'));
    expect(harmonicStationFor(db, 'PUG1717')).toBeDefined();
    expect(harmonicStationFor(db, 'chs-dodd-narrows')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/harmonic-chs.test.ts`
Expected: FAIL — `adaptChsBundle` not exported / `loadHarmonicDb` takes one arg.

- [ ] **Step 3: Implement in `src/sources/harmonic.ts`**

Replace the `loadHarmonicDb` function and add `adaptChsBundle` (keep the `cached` memo for the NOAA-only default call):

```ts
interface ChsBundleStation {
  id: string; name: string; floodDirection: number; ebbDirection: number; offset: number;
  constituents: { name: string; amplitude: number; phase: number }[];
}

// Adapt a chs-constituents bundle (built locally by the operator) into the plugin's
// HarmonicStation shape, keyed by the station's registry key (its `id`). Different
// field names, same content: floodDirection→floodDir, offset→z0Kn (mean flow),
// amplitude→amplitudeKn, phase→phaseDeg.
export function adaptChsBundle(bundle: unknown): Record<string, HarmonicStation> {
  const stations = (bundle as { stations?: ChsBundleStation[] }).stations ?? [];
  const out: Record<string, HarmonicStation> = {};
  for (const s of stations) {
    out[s.id] = {
      floodDir: s.floodDirection,
      ebbDir: s.ebbDirection,
      z0Kn: s.offset,
      constituents: s.constituents.map((c) => ({ name: c.name, amplitudeKn: c.amplitude, phaseDeg: c.phase })),
    };
  }
  return out;
}

// Loads the bundled NOAA constituent DB (keyed by NOAA id) and, when present,
// merges a locally-built CHS bundle from the data dir (keyed by registry key).
// The NOAA-only default call is memoized; the merged form is not (the CHS file
// changes when the operator rebuilds).
export function loadHarmonicDb(file?: string, chsBundlePath?: string): HarmonicDb {
  if (!file && !chsBundlePath && cached) return cached;
  const path = file ?? join(__dirname, '..', '..', 'data', 'harmonic-constituents.json');
  const db = JSON.parse(readFileSync(path, 'utf8')) as HarmonicDb;

  if (chsBundlePath) {
    try {
      const chs = adaptChsBundle(JSON.parse(readFileSync(chsBundlePath, 'utf8')));
      db.stations = { ...db.stations, ...chs };
    } catch {
      // No built CHS bundle yet (or unreadable) — NOAA-only is a valid state.
    }
  }

  if (!file && !chsBundlePath) cached = db;
  return db;
}
```

- [ ] **Step 4: Run the test to verify it passes, plus the suite**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/harmonic-chs.test.ts && npm test`
Expected: PASS; full suite still green (existing `harmonic-load.test.ts` calls `loadHarmonicDb()` with no args — unchanged behavior).

- [ ] **Step 5: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/sources/harmonic.ts test/harmonic-chs.test.ts
git commit -m "feat(harmonic): merge a locally-built CHS bundle, keyed by registry key

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 8: Strip the committed CHS defaults (signalk-currents)

**Repo:** `signalk-currents`

**Files:**
- Modify: `src/defaults.ts` (NOAA-only)
- Modify: `test/defaults.test.ts` (rewrite CHS assertions)

**Interfaces:**
- Produces: `DEFAULT_STATIONS: StationConfig[]` containing only the NOAA Boundary Pass entry.

- [ ] **Step 1: Rewrite the test first**

Replace `test/defaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_STATIONS } from '../src/defaults';

describe('DEFAULT_STATIONS', () => {
  it('ships only NOAA — no committed CHS station data (licence invariant)', () => {
    expect(DEFAULT_STATIONS.length).toBe(1);
    expect(DEFAULT_STATIONS.every((s) => s.provider === 'noaa')).toBe(true);
  });

  it('carries no CHS-shaped station ids', () => {
    // CHS ids are 24-hex Mongo ids; none may be committed.
    for (const s of DEFAULT_STATIONS) {
      expect(/^[0-9a-f]{24}$/.test(s.stationId)).toBe(false);
    }
  });

  it('the NOAA station carries a bin and no baked-in set directions', () => {
    const noaa = DEFAULT_STATIONS[0];
    expect(typeof noaa.noaaBin).toBe('number');
    expect(noaa.floodDir).toBeUndefined();
    expect(noaa.ebbDir).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/defaults.test.ts`
Expected: FAIL — `DEFAULT_STATIONS.length` is 20.

- [ ] **Step 3: Reduce `src/defaults.ts` to NOAA-only**

Replace the whole file:

```ts
import { StationConfig } from './types';

// The plugin ships NO Canadian (CHS) station data — CHS is copyrighted Crown
// data whose id and constituents must not be committed (see Phase 3 spec). The
// CHS gate list is sourced at runtime from @sailingnaturali/station-corrections
// (registry-stations.ts) and live ids are resolved from IWLS by name; offline CHS
// prediction comes from a bundle the operator builds locally.
//
// Only NOAA (US-Government public domain) is bundled. Set directions come from
// the provider at runtime (dirsSource: 'api'); config floodDir/ebbDir stay
// available as a per-station override.
export const DEFAULT_STATIONS: StationConfig[] = [
  { provider: 'noaa', stationId: 'PUG1717', noaaBin: 35, label: 'Boundary Pass', lat: 48.6912, lon: -123.245 },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/defaults.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Confirm no CHS ids remain anywhere in the source tree**

Run: `cd ~/src/sailingnaturali/signalk-currents && grep -rnE "[0-9a-f]{24}" src/ && echo "FOUND — investigate" || echo "clean: no 24-hex ids in src/"`
Expected: `clean: no 24-hex ids in src/`.

- [ ] **Step 6: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/defaults.ts test/defaults.test.ts
git commit -m "feat(defaults): ship NOAA-only; remove all committed CHS station ids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 9: Operator-triggered offline build action (signalk-currents)

**Repo:** `signalk-currents`

> A webapp button → admin-gated POST kicks off `buildBundle` async (it runs ~30 min), a status endpoint the webapp polls, then the result is written to the data dir and the harmonic DB reloaded. `buildBundle` is ESM; the CJS plugin loads it via an indirect dynamic import so `tsc` (module: CommonJS) does not rewrite it to `require`.

**Files:**
- Create: `src/build-action.ts` (import helper, run state, `runBuild`, `buildStatus`)
- Create: `public/index.html` (button + progress)
- Test: `test/build-action.test.ts` (create)

**Interfaces:**
- Consumes: `buildBundle` from `@sailingnaturali/chs-constituents/build` (via dynamic import); `HarmonicDb` reload callback.
- Produces:
  - `export interface BuildDeps { dataDir: string; buildBundleFn?: (opts: unknown) => Promise<Record<string, unknown>>; onProgress: (m: string) => void; onDone: () => void }`
  - `export function runBuild(deps: BuildDeps): void` — starts a build if none is running; writes `<dataDir>/chs-constituents.json` on success; idempotent while running
  - `export function buildStatus(): { running: boolean; message: string; error?: string }`

- [ ] **Step 1: Write the failing test**

Create `test/build-action.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runBuild, buildStatus } from '../src/build-action';

function flush() { return new Promise((r) => setTimeout(r, 10)); }

describe('runBuild', () => {
  it('writes the returned bundle to the data dir and reports done', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ba-'));
    const bundle = { note: 'NOT FOR NAVIGATION', stations: [{ id: 'chs-x' }] };
    const onDone = vi.fn();
    runBuild({
      dataDir,
      buildBundleFn: async () => bundle,
      onProgress: () => {},
      onDone,
    });
    await flush();
    const written = JSON.parse(readFileSync(join(dataDir, 'chs-constituents.json'), 'utf8'));
    expect(written.note).toContain('NOT FOR NAVIGATION');
    expect(onDone).toHaveBeenCalled();
    expect(buildStatus().running).toBe(false);
  });

  it('does not overwrite on build failure, and records the error', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ba-'));
    runBuild({
      dataDir,
      buildBundleFn: async () => { throw new Error('IWLS unreachable'); },
      onProgress: () => {},
      onDone: () => {},
    });
    await flush();
    expect(existsSync(join(dataDir, 'chs-constituents.json'))).toBe(false);
    expect(buildStatus().error).toMatch(/IWLS unreachable/);
    expect(buildStatus().running).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/build-action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/build-action.ts`**

```ts
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// tsc (module: CommonJS) rewrites a plain import() to require(), which cannot load
// chs-constituents (an ESM, type:module package). Keep a real dynamic import via an
// indirect expression tsc won't touch.
// ponytail: indirect-eval import shim; delete if the plugin ever moves to nodenext.
const importESM = new Function('s', 'return import(s)') as (s: string) => Promise<{ buildBundle: (o: unknown) => Promise<Record<string, unknown>> }>;

export interface BuildDeps {
  dataDir: string;
  // Injectable for tests; production resolves it from the ESM subpath.
  buildBundleFn?: (opts: unknown) => Promise<Record<string, unknown>>;
  onProgress: (message: string) => void;
  onDone: () => void;
}

let state: { running: boolean; message: string; error?: string } = { running: false, message: 'idle' };

export function buildStatus(): { running: boolean; message: string; error?: string } {
  return { ...state };
}

// Fire-and-forget: fitting ~30 stations takes ~30 min, far longer than an HTTP
// request can be held, so the POST route calls this and returns immediately while
// the webapp polls buildStatus(). Idempotent while a build is already running.
export function runBuild(deps: BuildDeps): void {
  if (state.running) return;
  state = { running: true, message: 'starting…' };

  (async () => {
    const build = deps.buildBundleFn
      ? deps.buildBundleFn
      : (await importESM('@sailingnaturali/chs-constituents/build')).buildBundle;

    const bundle = await build({
      cacheDir: join(deps.dataDir, 'chs-cache'),
      userAgent: 'signalk-currents (personal, non-commercial)',
      onProgress: (m: string) => { state = { running: true, message: m }; deps.onProgress(m); },
    });

    await mkdir(deps.dataDir, { recursive: true });
    await writeFile(join(deps.dataDir, 'chs-constituents.json'), JSON.stringify(bundle, null, 2));
    state = { running: false, message: `built ${(bundle.stations as unknown[]).length} stations` };
    deps.onDone();
  })().catch((e) => {
    // Leave any prior bundle untouched.
    state = { running: false, message: 'failed', error: (e as Error).message };
    deps.onProgress(`build failed: ${(e as Error).message}`);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/build-action.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Create the webapp `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Currents — build offline CHS models</title>
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    button { font-size: 1rem; padding: 0.5rem 1rem; }
    #log { white-space: pre-wrap; background: #f4f4f4; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; min-height: 3rem; }
    .note { color: #555; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Offline CHS current models</h1>
  <p>Fetches every live CHS current station and fits harmonic models on this machine,
     under your own CHS licence, for offline Canadian current prediction. Runs ~30 minutes.</p>
  <p class="note">Output stays on this server and must not be redistributed (Crown copyright, not for navigation).</p>
  <button id="go">Build offline models</button>
  <div id="log">idle</div>
  <script>
    const log = document.getElementById('log');
    const go = document.getElementById('go');
    async function poll() {
      const s = await (await fetch('build/status', { credentials: 'include' })).json();
      log.textContent = s.error ? ('failed: ' + s.error) : s.message;
      go.disabled = s.running;
      if (s.running) setTimeout(poll, 3000);
    }
    go.onclick = async () => {
      go.disabled = true; log.textContent = 'starting…';
      const r = await fetch('build', { method: 'POST', credentials: 'include' });
      if (!r.ok) { log.textContent = 'start failed (' + r.status + ') — are you logged in as admin?'; go.disabled = false; return; }
      poll();
    };
    poll();
  </script>
</body>
</html>
```

> **package.json `files`** must include `"public"` so the webapp ships (wired in Task 10).

- [ ] **Step 6: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/build-action.ts public/index.html test/build-action.test.ts
git commit -m "feat(build-action): operator-triggered offline CHS build + webapp button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

### Task 10: Wire it into the plugin (signalk-currents)

**Repo:** `signalk-currents`

> Assemble the effective station list (config default `[NOAA]` + registry CHS gates, deduped), resolve CHS live ids at `start()`, load the merged harmonic DB from the data dir, and register the build route + webapp. Update `package.json`.

**Files:**
- Modify: `src/index.ts` (imports, station assembly, live-id resolution, harmonic DB path, `registerWithRouter`)
- Modify: `package.json` (deps + `files`)
- Test: `test/index-stations.test.ts` (create — the pure station-assembly helper)

**Interfaces:**
- Consumes: `registryChsStations` (Task 5), `resolveLiveIds` (Task 4), `loadHarmonicDb(file?, chsBundlePath?)` (Task 7), `runBuild`/`buildStatus` (Task 9).
- Produces: `export function effectiveStations(configStations: StationConfig[]): StationConfig[]` — config + registry CHS, deduped by `stationId`.

- [ ] **Step 1: Write the failing test for the station-assembly helper**

Create `test/index-stations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { effectiveStations } from '../src/index';
import { StationConfig } from '../src/types';

const NOAA: StationConfig = { provider: 'noaa', stationId: 'PUG1717', noaaBin: 35, label: 'Boundary Pass', lat: 48.69, lon: -123.24 };

describe('effectiveStations', () => {
  it('merges the NOAA config default with the registry CHS gates', () => {
    const out = effectiveStations([NOAA]);
    expect(out.some((s) => s.stationId === 'PUG1717')).toBe(true);
    expect(out.some((s) => s.provider === 'chs' && s.stationId === 'chs-dodd-narrows')).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(20);
  });

  it('dedupes by stationId (a config override wins over the registry entry)', () => {
    const override: StationConfig = { provider: 'chs', stationId: 'chs-dodd-narrows', label: 'Dodd Narrows (mine)', lat: 49.1, lon: -123.8 };
    const out = effectiveStations([NOAA, override]);
    const dodd = out.filter((s) => s.stationId === 'chs-dodd-narrows');
    expect(dodd).toHaveLength(1);
    expect(dodd[0].label).toBe('Dodd Narrows (mine)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/index-stations.test.ts`
Expected: FAIL — `effectiveStations` not exported.

- [ ] **Step 3: Edit `src/index.ts`**

3a. Add imports near the top:

```ts
import { registryChsStations } from './registry-stations';
import { resolveLiveIds } from './sources/iwls-index';
import { normalizeName } from './sources/iwls-index';
import { runBuild, buildStatus } from './build-action';
```

3b. Add the exported helper above `export = function (...)`:

```ts
// The effective station list: the config default (NOAA only) plus every CHS gate
// from the shared registry. Config entries win on stationId collision, so an
// operator can override a registry gate locally without editing the registry.
export function effectiveStations(configStations: StationConfig[]): StationConfig[] {
  const byId = new Map<string, StationConfig>();
  for (const s of registryChsStations()) byId.set(s.stationId, s);
  for (const s of configStations) byId.set(s.stationId, s); // config overrides registry
  return [...byId.values()];
}
```

3c. In `start()`, replace `const stations = options.stations ?? DEFAULT_STATIONS;` with:

```ts
      const stations = effectiveStations(options.stations ?? DEFAULT_STATIONS);

      // Resolve each CHS gate's live IWLS id by name (used only to fetch; never
      // stored). Offline, resolution fails → those gates serve the harmonic
      // fallback (once built). Re-resolved on each start.
      try {
        const liveIds = await resolveLiveIds();
        for (const s of stations) {
          if (s.provider === 'chs') s.liveId = liveIds.get(normalizeName(s.label));
        }
      } catch (e) {
        app.debug(`live CHS id resolution failed (offline?): ${(e as Error).message}`);
      }
```

> `start()` must be `async` for the `await` — change its signature to `async start(options: Options) {`. SignalK awaits the returned promise.

3d. Point `loadHarmonicDb` at the data-dir CHS bundle. Replace `const harmonicDb = loadHarmonicDb();` with:

```ts
      const chsBundlePath = join(app.getDataDirPath(), 'chs-constituents.json');
      let harmonicDb = loadHarmonicDb(undefined, chsBundlePath);
```

3e. Register the admin-gated build route (inside `start()`, near the resource provider registration). `registerWithRouter` gives an Express router mounted at `/plugins/signalk-currents`; the webapp (`public/`) is served at `/signalk-currents/`:

```ts
    registerWithRouter(router) {
      // POST /plugins/signalk-currents/build — kick off the offline model build.
      // Admin-gated (registerWithRouter is), which is correct for a ~30-min job.
      router.post('/build', (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
        runBuild({
          dataDir: app.getDataDirPath(),
          onProgress: (m) => app.setPluginStatus(`offline build: ${m}`),
          onDone: () => { harmonicDb = loadHarmonicDb(undefined, chsBundlePath); }, // hot-reload
        });
        res.status(202).json(buildStatus());
      });
      router.get('/status', (_req: unknown, res: { json: (b: unknown) => void }) => {
        res.json(buildStatus());
      });
    },
```

> `registerWithRouter` is a top-level plugin property (sibling of `start`/`stop`), not inside `start()`. Place it on the `plugin` object. Because it closes over `harmonicDb` and `chsBundlePath`, lift those two to the plugin-closure scope (declare them alongside `cache`/`series` at the top of the `export =` function, assign in `start()`).

3f. Move `let harmonicDb` and `const chsBundlePath` declarations up to the plugin closure (beside `const cache`/`const series`) so both `start()` and `registerWithRouter` see them:

```ts
  let harmonicDb: ReturnType<typeof loadHarmonicDb>;
  let chsBundlePath: string;
```
and in `start()` assign (not redeclare): `chsBundlePath = join(...); harmonicDb = loadHarmonicDb(undefined, chsBundlePath);`

- [ ] **Step 4: Run the helper test + full suite + build**

Run: `cd ~/src/sailingnaturali/signalk-currents && npx vitest run test/index-stations.test.ts && npm test && npm run build`
Expected: PASS; full suite green; `tsc` clean.

- [ ] **Step 5: Update `package.json` deps and `files`**

Add to `dependencies`:

```json
    "@sailingnaturali/station-corrections": "^2.0.0",
    "@sailingnaturali/chs-constituents": "^0.1.0",
```

Add `"public"` to `files`:

```json
  "files": [ "dist", "data", "public", "docs/screenshots/" ],
```

> **GATE:** `npm install` resolves `@sailingnaturali/chs-constituents` and `station-corrections@^2.0.0` only after both are published. For local end-to-end dev before then: `npm install ../chs-constituents ../station-corrections` (installs from the sibling checkouts). Record that CI stays red until the publishes land.

- [ ] **Step 6: Live smoke test (one station, real network)**

Run: `cd ~/src/sailingnaturali/signalk-currents && npm run build && node -e "
const { resolveLiveIds } = require('./dist/sources/iwls-index');
resolveLiveIds().then(m => console.log('Active Pass live id:', m.get('active pass'))).catch(e => { console.error(e); process.exit(1); });
"`
Expected: prints a 24-hex live id for Active Pass — proves the runtime id-resolution path against the real IWLS API.

- [ ] **Step 7: Commit**

```bash
cd ~/src/sailingnaturali/signalk-currents
git add src/index.ts package.json test/index-stations.test.ts
git commit -m "feat(index): registry CHS gates + live id resolution + offline build route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D89NEm8fGCAUpBz48eCj9T"
```

---

## Self-Review

**Spec coverage:**
- §1.1 buildBundle extraction → Task 1. ✓
- §1.2 station-corrections ^2.0.0 → Task 2 (gated). ✓
- §1.3 publish-prep → Task 2. ✓
- §2.1 strip CHS defaults → Task 8. ✓
- §2.2 live id resolution → Task 4 (resolver) + Task 10 (wired at start). ✓
- §2.3 registry CHS list + STRONG_GATES → Task 5. ✓
- §2.4 identity refactor (registry-key identity, liveId) → Task 6 + Task 10. ✓
- §2.5 offline build action (webapp + POST + buildBundle → data dir → reload) → Task 9 + Task 10. ✓
- §2.6 merged harmonic DB + field adapter + NOTE retained → Task 7. ✓
- §2.7 deps → Task 10 (+ Task 2). ✓
- §Risks #2 api-sine vs api-iwls → Task 3 (early guard). ✓

**Placeholder scan:** every code/test step shows complete code; no TBD/TODO. The one deliberate non-code decision (Task 3 FAIL branch) is an explicit escalate-to-Bryan, not a silent placeholder. ✓

**Type consistency:** `StationConfig.stationId` = stable identity (registry key for CHS) everywhere; `liveId` added in Task 6 and read only in `fetch.ts` + set in Task 10; `resolveLiveIds`/`normalizeName` names identical across Tasks 4/10; `loadHarmonicDb(file?, chsBundlePath?)` signature identical Tasks 7/10; `HarmonicStation` field names (`floodDir`/`ebbDir`/`z0Kn`/`amplitudeKn`/`phaseDeg`) match `harmonic.ts`; `buildBundle` option/return shape identical Tasks 1/9. ✓

**Gates recorded:** Tasks 2, 5, 10 note the publish dependency and how to dev/test before it lands. ✓
