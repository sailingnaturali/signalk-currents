import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runBuild, buildStatus } from '../src/build-action';

function flush() { return new Promise((r) => setTimeout(r, 10)); }

describe('runBuild', () => {
  it('writes atomically — no .tmp file left behind on success', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ba-'));
    runBuild({
      dataDir,
      buildBundleFn: async () => ({ note: 'x', stations: [] }),
      onProgress: () => {},
      onDone: () => {},
    });
    await flush();
    expect(existsSync(join(dataDir, 'chs-constituents.json'))).toBe(true);
    expect(existsSync(join(dataDir, 'chs-constituents.json.tmp'))).toBe(false);
  });

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
