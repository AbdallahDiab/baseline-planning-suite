import { describe, expect, it } from 'vitest';
import { rollupEffortAndCost } from './index';
import type { WbsItem } from './index';

const items: readonly WbsItem[] = [
  { id: 'a', projectId: 'prj-1', parentId: null, name: 'A' },
  { id: 'b', projectId: 'prj-1', parentId: 'a', name: 'B' },
  { id: 'c', projectId: 'prj-1', parentId: 'b', name: 'C' },
  { id: 'g', projectId: 'prj-1', parentId: 'b', name: 'G' },
  { id: 'd', projectId: 'prj-1', parentId: null, name: 'D' },
  { id: 'f', projectId: 'prj-1', parentId: 'd', name: 'F' },
];

describe('parent rollups', () => {
  it('sums leaves into parents and roots', () => {
    const rolled = rollupEffortAndCost(items, [
      { itemId: 'c', personMonths: 0.2, cost: 10 },
      { itemId: 'g', personMonths: 0.25, cost: 5 },
      { itemId: 'g', personMonths: 0.05, cost: 1 },
      { itemId: 'f', personMonths: 0.1, cost: 4 },
    ]);
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) {
      return;
    }
    expect(rolled.value.get('c')).toEqual({ personMonths: 0.2, cost: 10 });
    expect(rolled.value.get('g')).toEqual({ personMonths: 0.3, cost: 6 });
    expect(rolled.value.get('b')).toEqual({ personMonths: 0.5, cost: 16 });
    expect(rolled.value.get('a')).toEqual({ personMonths: 0.5, cost: 16 });
    expect(rolled.value.get('f')).toEqual({ personMonths: 0.1, cost: 4 });
    expect(rolled.value.get('d')).toEqual({ personMonths: 0.1, cost: 4 });
  });

  it('rejects a contribution stored directly on a parent', () => {
    expect(
      rollupEffortAndCost(items, [{ itemId: 'b', personMonths: 1, cost: 50 }]),
    ).toEqual({
      ok: false,
      error: { code: 'not-a-leaf', itemId: 'b' },
    });
  });
});
