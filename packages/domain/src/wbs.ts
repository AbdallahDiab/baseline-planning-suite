import { err, ok } from './result';
import type { DomainResult } from './result';

/** Root, one child level, and one grandchild level. */
export const WBS_LEVEL_COUNT = 3;
/** Deepest allowed depth. Root is 0. */
export const WBS_MAX_DEPTH = WBS_LEVEL_COUNT - 1;

export interface WbsItem {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
}

export interface WbsAllocationRef {
  breakdownItemId: string;
}

export type WbsTreeError =
  | { code: 'duplicate-id'; itemId: string }
  | { code: 'missing-parent'; itemId: string; parentId: string }
  | { code: 'cross-project-parent'; itemId: string; parentId: string }
  | { code: 'cycle'; itemId: string }
  | { code: 'depth-exceeded'; itemId: string; depth: number };

export type WbsMoveError =
  | { code: 'invalid-tree'; tree: WbsTreeError }
  | { code: 'not-found'; itemId: string }
  | { code: 'parent-not-found'; parentId: string }
  | { code: 'cross-project'; itemId: string; parentId: string }
  | { code: 'under-self'; itemId: string }
  | { code: 'cycle'; itemId: string; parentId: string }
  | { code: 'depth-exceeded'; itemId: string; resultingDepth: number };

export type WbsAddChildError =
  | { code: 'invalid-tree'; tree: WbsTreeError }
  | { code: 'parent-not-found'; parentId: string }
  | { code: 'allocated-leaf'; parentId: string }
  | { code: 'depth-exceeded'; parentId: string; resultingDepth: number };

export type WbsDeleteError =
  | { code: 'invalid-tree'; tree: WbsTreeError }
  | { code: 'not-found'; itemId: string }
  | { code: 'has-children'; itemId: string }
  | { code: 'has-allocations'; itemId: string };

export type WbsLeafError =
  | { code: 'invalid-tree'; tree: WbsTreeError }
  | { code: 'not-found'; itemId: string }
  | { code: 'not-a-leaf'; itemId: string };

interface WbsIndex {
  items: readonly WbsItem[];
  byId: ReadonlyMap<string, WbsItem>;
  children: ReadonlyMap<string, readonly WbsItem[]>;
}

function indexTree(items: readonly WbsItem[]): DomainResult<WbsIndex, WbsTreeError> {
  const byId = new Map<string, WbsItem>();
  for (const item of items) {
    if (byId.has(item.id)) {
      return err({ code: 'duplicate-id', itemId: item.id });
    }
    byId.set(item.id, item);
  }

  const children = new Map<string, WbsItem[]>();
  for (const item of items) {
    if (item.parentId === null) {
      continue;
    }
    const parent = byId.get(item.parentId);
    if (!parent) {
      return err({ code: 'missing-parent', itemId: item.id, parentId: item.parentId });
    }
    if (parent.projectId !== item.projectId) {
      return err({ code: 'cross-project-parent', itemId: item.id, parentId: item.parentId });
    }
    const siblings = children.get(item.parentId);
    if (siblings) {
      siblings.push(item);
    } else {
      children.set(item.parentId, [item]);
    }
  }

  const color = new Map<string, 'visiting' | 'done'>();
  const visit = (itemId: string): WbsTreeError | null => {
    const state = color.get(itemId);
    if (state === 'visiting') {
      return { code: 'cycle', itemId };
    }
    if (state === 'done') {
      return null;
    }
    color.set(itemId, 'visiting');
    const parentId = byId.get(itemId)?.parentId;
    if (parentId) {
      const cycle = visit(parentId);
      if (cycle) {
        return cycle;
      }
    }
    color.set(itemId, 'done');
    return null;
  };
  for (const item of items) {
    const cycle = visit(item.id);
    if (cycle) {
      return err(cycle);
    }
  }

  for (const item of items) {
    const depth = depthOf(item.id, byId);
    if (depth > WBS_MAX_DEPTH) {
      return err({ code: 'depth-exceeded', itemId: item.id, depth });
    }
  }

  return ok({ items, byId, children });
}

function depthOf(itemId: string, byId: ReadonlyMap<string, WbsItem>): number {
  let depth = 0;
  let current = byId.get(itemId);
  while (current?.parentId) {
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

function requireTree(items: readonly WbsItem[]): DomainResult<WbsIndex, { code: 'invalid-tree'; tree: WbsTreeError }> {
  const indexed = indexTree(items);
  if (!indexed.ok) {
    return err({ code: 'invalid-tree', tree: indexed.error });
  }
  return indexed;
}

function isLeaf(index: WbsIndex, itemId: string): boolean {
  return (index.children.get(itemId)?.length ?? 0) === 0;
}

function hasDirectAllocation(allocations: readonly WbsAllocationRef[], itemId: string): boolean {
  return allocations.some((allocation) => allocation.breakdownItemId === itemId);
}

export function validateWbsTree(items: readonly WbsItem[]): DomainResult<void, WbsTreeError> {
  const indexed = indexTree(items);
  if (!indexed.ok) {
    return indexed;
  }
  return ok(undefined);
}

export function validateMoveWbsItem(
  items: readonly WbsItem[],
  itemId: string,
  newParentId: string | null,
): DomainResult<void, WbsMoveError> {
  const indexed = requireTree(items);
  if (!indexed.ok) {
    return indexed;
  }
  const item = indexed.value.byId.get(itemId);
  if (!item) {
    return err({ code: 'not-found', itemId });
  }
  if (newParentId !== null) {
    const parent = indexed.value.byId.get(newParentId);
    if (!parent) {
      return err({ code: 'parent-not-found', parentId: newParentId });
    }
    if (parent.projectId !== item.projectId) {
      return err({ code: 'cross-project', itemId, parentId: newParentId });
    }
    if (newParentId === itemId) {
      return err({ code: 'under-self', itemId });
    }
    let ancestor: WbsItem | undefined = parent;
    while (ancestor) {
      if (ancestor.id === itemId) {
        return err({ code: 'cycle', itemId, parentId: newParentId });
      }
      ancestor = ancestor.parentId ? indexed.value.byId.get(ancestor.parentId) : undefined;
    }
  }

  const nextDepth = newParentId === null ? 0 : depthOf(newParentId, indexed.value.byId) + 1;
  const violation = subtreeDepthViolation(itemId, nextDepth, indexed.value.children);
  if (violation) {
    return err({
      code: 'depth-exceeded',
      itemId: violation.itemId,
      resultingDepth: violation.depth,
    });
  }
  return ok(undefined);
}

function subtreeDepthViolation(
  rootId: string,
  rootDepth: number,
  children: ReadonlyMap<string, readonly WbsItem[]>,
): { itemId: string; depth: number } | null {
  const stack: Array<{ itemId: string; depth: number }> = [{ itemId: rootId, depth: rootDepth }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    if (current.depth > WBS_MAX_DEPTH) {
      return current;
    }
    const kids = children.get(current.itemId) ?? [];
    for (let index = kids.length - 1; index >= 0; index -= 1) {
      const child = kids[index];
      if (child) {
        stack.push({ itemId: child.id, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

/**
 * Adding a child to an allocated leaf is rejected.
 * Existing allocations stay where they are.
 */
export function validateAddWbsChild(
  items: readonly WbsItem[],
  parentId: string,
  allocations: readonly WbsAllocationRef[],
): DomainResult<{ childDepth: number }, WbsAddChildError> {
  const indexed = requireTree(items);
  if (!indexed.ok) {
    return indexed;
  }
  const parent = indexed.value.byId.get(parentId);
  if (!parent) {
    return err({ code: 'parent-not-found', parentId });
  }
  if (isLeaf(indexed.value, parentId) && hasDirectAllocation(allocations, parentId)) {
    return err({ code: 'allocated-leaf', parentId });
  }
  const childDepth = depthOf(parentId, indexed.value.byId) + 1;
  if (childDepth > WBS_MAX_DEPTH) {
    return err({ code: 'depth-exceeded', parentId, resultingDepth: childDepth });
  }
  return ok({ childDepth });
}

/**
 * Deletion is rejected while the item still has children or allocations.
 * Nothing is cascade-deleted.
 */
export function validateDeleteWbsItem(
  items: readonly WbsItem[],
  itemId: string,
  allocations: readonly WbsAllocationRef[],
): DomainResult<void, WbsDeleteError> {
  const indexed = requireTree(items);
  if (!indexed.ok) {
    return indexed;
  }
  if (!indexed.value.byId.has(itemId)) {
    return err({ code: 'not-found', itemId });
  }
  if (!isLeaf(indexed.value, itemId)) {
    return err({ code: 'has-children', itemId });
  }
  if (hasDirectAllocation(allocations, itemId)) {
    return err({ code: 'has-allocations', itemId });
  }
  return ok(undefined);
}

/** Parent effort is derived. An allocation target must already be a leaf. */
export function validateLeafAllocationTarget(
  items: readonly WbsItem[],
  itemId: string,
): DomainResult<void, WbsLeafError> {
  const indexed = requireTree(items);
  if (!indexed.ok) {
    return indexed;
  }
  if (!indexed.value.byId.has(itemId)) {
    return err({ code: 'not-found', itemId });
  }
  if (!isLeaf(indexed.value, itemId)) {
    return err({ code: 'not-a-leaf', itemId });
  }
  return ok(undefined);
}
