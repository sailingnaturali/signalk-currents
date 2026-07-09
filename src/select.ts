import { CurrentEvent, CurrentSource } from './types';

interface DirData { events: CurrentEvent[]; floodDir?: number; ebbDir?: number; }
export interface Selected { data: DirData; source: CurrentSource; live: boolean; }

// Live is the source of truth; harmonic is the offline fallback. undefined liveData
// means the live fetch failed this cycle.
export function selectData(
  liveData: DirData | undefined,
  harmonicData: DirData | undefined,
  provider: 'chs' | 'noaa',
): Selected | undefined {
  if (liveData) return { data: liveData, source: provider, live: true };
  if (harmonicData) return { data: harmonicData, source: 'harmonic', live: false };
  return undefined;
}
