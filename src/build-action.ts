import { writeFile, mkdir, rename } from 'fs/promises';
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
    // Write to a temp file then rename — atomic on the same filesystem, so a crash
    // mid-write can't leave a half-written bundle that loadHarmonicDb then rejects.
    const finalPath = join(deps.dataDir, 'chs-constituents.json');
    const tmpPath = `${finalPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(bundle, null, 2));
    await rename(tmpPath, finalPath);
    state = { running: false, message: `built ${(bundle.stations as unknown[]).length} stations` };
    deps.onDone();
  })().catch((e) => {
    // Leave any prior bundle untouched.
    state = { running: false, message: 'failed', error: (e as Error).message };
    deps.onProgress(`build failed: ${(e as Error).message}`);
  });
}
