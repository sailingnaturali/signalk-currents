import { describe, it, expect } from 'vitest';
import { eventFromParts, CurrentEvent } from '../src/types';

describe('CurrentEvent', () => {
  it('normalizes a slack event', () => {
    const e: CurrentEvent = eventFromParts('2026-06-06T04:14:00Z', 'slack', 0);
    expect(e.kind).toBe('slack');
    expect(e.speedKn).toBe(0);
    expect(e.utc).toBe('2026-06-06T04:14:00.000Z'); // canonical ISO
  });
  it('keeps speed magnitude positive', () => {
    expect(eventFromParts('2026-06-06T05:40:00Z', 'ebb', -3.2).speedKn).toBe(3.2);
  });
});
