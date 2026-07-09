import { describe, it, expect } from 'vitest';
import { selectData } from '../src/select';
import { CurrentEvent } from '../src/types';

const evs: CurrentEvent[] = [{ utc: '2026-07-01T01:00:00Z', kind: 'slack', speedKn: 0 }];
const liveData = { events: evs, floodDir: 100 };
const harmonicData = { events: evs, floodDir: 111, ebbDir: 291 };

describe('selectData', () => {
  it('prefers live when the live fetch succeeded', () => {
    const s = selectData(liveData, harmonicData, 'noaa')!;
    expect(s.source).toBe('noaa');
    expect(s.live).toBe(true);
    expect(s.data.floodDir).toBe(100);
  });

  it('falls back to harmonic when live failed', () => {
    const s = selectData(undefined, harmonicData, 'chs')!;
    expect(s.source).toBe('harmonic');
    expect(s.live).toBe(false);
    expect(s.data.floodDir).toBe(111);
  });

  it('returns undefined when neither is available', () => {
    expect(selectData(undefined, undefined, 'chs')).toBeUndefined();
  });
});
