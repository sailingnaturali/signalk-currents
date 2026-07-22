import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
// index.ts uses `export =`; esModuleInterop maps that to a default import.
import makePlugin from '../src/index';

// Minimal ServerAPI stub — just enough for start()/registerWithRouter() to run
// without touching a real SignalK server.
const mockApp = {
  getDataDirPath: () => tmpdir(),
  setPluginStatus() {},
  setPluginError() {},
  debug() {},
  error() {},
  getSelfPath() { return undefined; },
  handleMessage() {},
  registerResourceProvider() {},
  savePluginOptions() {},
};

describe('registerWithRouter', () => {
  it('registers POST /build and GET /status at the paths the webapp depends on', () => {
    const plugin = makePlugin(mockApp);
    const routes: Record<string, (req: unknown, res: unknown) => void> = {};
    const mockRouter = {
      post: (path: string, handler: (req: unknown, res: unknown) => void) => { routes['POST ' + path] = handler; },
      get: (path: string, handler: (req: unknown, res: unknown) => void) => { routes['GET ' + path] = handler; },
    };

    plugin.registerWithRouter(mockRouter);

    expect(routes['POST /build']).toBeTypeOf('function');
    expect(routes['GET /status']).toBeTypeOf('function');

    // POST /build: runBuild fires (and will settle into an error state async,
    // since chs-constituents isn't installed here) — only the synchronous
    // response shape matters.
    let statusCode: number | undefined;
    let postBody: { running?: boolean } | undefined;
    routes['POST /build']({}, {
      status: (n: number) => { statusCode = n; return { json: (b: { running?: boolean }) => { postBody = b; } }; },
    });
    expect(statusCode).toBe(202);
    expect(typeof postBody?.running).toBe('boolean');

    // GET /status: just the response shape.
    let getBody: { running?: boolean } | undefined;
    routes['GET /status']({}, { json: (b: { running?: boolean }) => { getBody = b; } });
    expect(typeof getBody?.running).toBe('boolean');
  });
});
