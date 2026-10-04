import { describe, expect, it } from 'vitest';
import {
  validateAddWbsChild,
  validateDeleteWbsItem,
  validateLeafAllocationTarget,
  validateMoveWbsItem,
  validateWbsTree,
  WBS_MAX_DEPTH,
} from './index';
import type { WbsItem } from './index';

const items: readonly WbsItem[] = [
  { id: 'a', projectId: 'prj-1', parentId: null, name: 'A' },
  { id: 'b', projectId: 'prj-1', parentId: 'a', name: 'B' },
  { id: 'c', projectId: 'prj-1', parentId: 'b', name: 'C' },
  { id: 'g', projectId: 'prj-1', parentId: 'b', name: 'G' },
  { id: 'd', projectId: 'prj-1', parentId: null, name: 'D' },
  { id: 'f', projectId: 'prj-1', parentId: 'd', name: 'F' },
  { id: 'e', projectId: 'prj-2', parentId: null, name: 'E' },
];

describe('WBS validation', () => {
  it('accepts a tree of three levels', () => {
    expect(WBS_MAX_DEPTH).toBe(2);
    expect(validateWbsTree(items)).toEqual({ ok: true, value: undefined });
  });

  it('rejects structural tree problems', () => {
    expect(
      validateWbsTree([
        { id: 'a', projectId: 'prj-1', parentId: null, name: 'A' },
        { id: 'a', projectId: 'prj-1', parentId: null, name: 'Again' },
      ]).ok,
    ).toBe(false);

    expect(
      validateWbsTree([{ id: 'child', projectId: 'prj-1', parentId: 'missing', name: 'Child' }]),
    ).toEqual({
      ok: false,
      error: { code: 'missing-parent', itemId: 'child', parentId: 'missing' },
    });

    expect(
      validateWbsTree([
        { id: 'root', projectId: 'prj-2', parentId: null, name: 'Root' },
        { id: 'child', projectId: 'prj-1', parentId: 'root', name: 'Child' },
      ]),
    ).toEqual({
      ok: false,
      error: { code: 'cross-project-parent', itemId: 'child', parentId: 'root' },
    });

    expect(
      validateWbsTree([
        { id: 'a', projectId: 'prj-1', parentId: 'b', name: 'A' },
        { id: 'b', projectId: 'prj-1', parentId: 'a', name: 'B' },
      ]),
    ).toEqual({ ok: false, error: { code: 'cycle', itemId: 'a' } });

    expect(
      validateWbsTree([
        { id: 'root', projectId: 'prj-1', parentId: null, name: 'Root' },
        { id: 'mid', projectId: 'prj-1', parentId: 'root', name: 'Mid' },
        { id: 'leaf', projectId: 'prj-1', parentId: 'mid', name: 'Leaf' },
        { id: 'too-deep', projectId: 'prj-1', parentId: 'leaf', name: 'Too deep' },
      ]),
    ).toEqual({
      ok: false,
      error: { code: 'depth-exceeded', itemId: 'too-deep', depth: 3 },
    });
  });

  it('moves only inside the same project and inside the depth limit', () => {
    expect(validateMoveWbsItem(items, 'c', 'd', [])).toEqual({ ok: true, value: undefined });
    expect(validateMoveWbsItem(items, 'b', 'd', [])).toEqual({ ok: true, value: undefined });
    expect(validateMoveWbsItem(items, 'a', null, [])).toEqual({ ok: true, value: undefined });

    expect(validateMoveWbsItem(items, 'c', 'c', [])).toEqual({
      ok: false,
      error: { code: 'under-self', itemId: 'c' },
    });
    expect(validateMoveWbsItem(items, 'b', 'c', [])).toEqual({
      ok: false,
      error: { code: 'cycle', itemId: 'b', parentId: 'c' },
    });
    expect(validateMoveWbsItem(items, 'c', 'e', [])).toEqual({
      ok: false,
      error: { code: 'cross-project', itemId: 'c', parentId: 'e' },
    });
    expect(validateMoveWbsItem(items, 'a', 'd', [])).toEqual({
      ok: false,
      error: { code: 'depth-exceeded', itemId: 'c', resultingDepth: 3 },
    });
    expect(validateMoveWbsItem(items, 'missing', null, [])).toEqual({
      ok: false,
      error: { code: 'not-found', itemId: 'missing' },
    });
  });

  it('rejects a move under an allocated leaf and allows the same move without that allocation', () => {
    expect(validateMoveWbsItem(items, 'g', 'f', [{ breakdownItemId: 'f' }])).toEqual({
      ok: false,
      error: { code: 'allocated-leaf', parentId: 'f' },
    });
    expect(validateMoveWbsItem(items, 'g', 'f', [])).toEqual({ ok: true, value: undefined });
  });

  it('rejects a new child on an allocated leaf and keeps the allocation', () => {
    expect(validateAddWbsChild(items, 'f', [{ breakdownItemId: 'f' }])).toEqual({
      ok: false,
      error: { code: 'allocated-leaf', parentId: 'f' },
    });
    expect(validateAddWbsChild(items, 'c', [{ breakdownItemId: 'c' }])).toEqual({
      ok: false,
      error: { code: 'allocated-leaf', parentId: 'c' },
    });
    expect(validateAddWbsChild(items, 'c', [])).toEqual({
      ok: false,
      error: { code: 'depth-exceeded', parentId: 'c', resultingDepth: 3 },
    });
    expect(validateAddWbsChild(items, 'f', [])).toEqual({ ok: true, value: { childDepth: 2 } });
    expect(validateAddWbsChild(items, 'b', [{ breakdownItemId: 'b' }])).toEqual({
      ok: true,
      value: { childDepth: 2 },
    });
  });

  it('rejects deletion while children or allocations remain', () => {
    expect(validateDeleteWbsItem(items, 'a', [])).toEqual({
      ok: false,
      error: { code: 'has-children', itemId: 'a' },
    });
    expect(validateDeleteWbsItem(items, 'c', [{ breakdownItemId: 'c' }])).toEqual({
      ok: false,
      error: { code: 'has-allocations', itemId: 'c' },
    });
    expect(validateDeleteWbsItem(items, 'c', [])).toEqual({ ok: true, value: undefined });
    expect(validateDeleteWbsItem(items, 'missing', [])).toEqual({
      ok: false,
      error: { code: 'not-found', itemId: 'missing' },
    });
  });

  it('allows allocations only on leaves', () => {
    expect(validateLeafAllocationTarget(items, 'c')).toEqual({ ok: true, value: undefined });
    expect(validateLeafAllocationTarget(items, 'b')).toEqual({
      ok: false,
      error: { code: 'not-a-leaf', itemId: 'b' },
    });
  });
});
