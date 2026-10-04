import type { Allocation, BreakdownItem } from '@baseline/contracts';
import {
  validateAddWbsChild,
  validateDeleteWbsItem,
  validateMoveWbsItem,
  type WbsAllocationRef,
  type WbsItem,
} from '@baseline/delivery-domain';

export interface WbsNode {
  item: BreakdownItem;
  depth: number;
  children: readonly WbsNode[];
}

export interface MoveDestination {
  parentId: string | null;
  label: string;
}

export function toAllocationRefs(allocations: readonly Allocation[]): WbsAllocationRef[] {
  return allocations.map((allocation) => ({ breakdownItemId: allocation.breakdownItemId }));
}

/**
 * Groups items by parent without changing the API objects.
 * Sibling order follows the order returned by the API.
 */
export function buildWbsTree(items: readonly BreakdownItem[]): WbsNode[] {
  const childrenByParent = new Map<string | null, BreakdownItem[]>();
  for (const item of items) {
    const siblings = childrenByParent.get(item.parentId);
    if (siblings) {
      siblings.push(item);
    } else {
      childrenByParent.set(item.parentId, [item]);
    }
  }

  const toNode = (item: BreakdownItem, depth: number): WbsNode => ({
    item,
    depth,
    children: (childrenByParent.get(item.id) ?? []).map((child) => toNode(child, depth + 1)),
  });

  return (childrenByParent.get(null) ?? []).map((item) => toNode(item, 0));
}

export function hasDirectAllocations(refs: readonly WbsAllocationRef[], itemId: string): boolean {
  return refs.some((allocation) => allocation.breakdownItemId === itemId);
}

export function canAddChild(
  items: readonly BreakdownItem[],
  parentId: string,
  refs: readonly WbsAllocationRef[],
): boolean {
  return validateAddWbsChild(toWbsItems(items), parentId, refs).ok;
}

export function deleteBlockReason(
  items: readonly BreakdownItem[],
  itemId: string,
  refs: readonly WbsAllocationRef[],
): string | null {
  const result = validateDeleteWbsItem(toWbsItems(items), itemId, refs);
  if (result.ok) {
    return null;
  }
  switch (result.error.code) {
    case 'has-children':
      return 'This item has children, so it cannot be deleted.';
    case 'has-allocations':
      return 'This item has allocations, so it cannot be deleted.';
    case 'not-found':
      return 'This item is no longer available.';
    case 'invalid-tree':
      return 'The work breakdown structure is invalid, so this item cannot be deleted.';
    default:
      return assertNever(result.error);
  }
}

export function moveDestinations(
  items: readonly BreakdownItem[],
  itemId: string,
  refs: readonly WbsAllocationRef[],
): MoveDestination[] {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) {
    return [];
  }
  const domainItems = toWbsItems(items);
  const candidates: Array<string | null> = [null, ...items.map((entry) => entry.id)];
  const destinations: MoveDestination[] = [];
  for (const parentId of candidates) {
    if (parentId === item.parentId) {
      continue;
    }
    if (!validateMoveWbsItem(domainItems, itemId, parentId, refs).ok) {
      continue;
    }
    destinations.push({
      parentId,
      label: parentId === null ? 'Root' : itemPath(items, parentId),
    });
  }
  return destinations;
}

export function noMoveDestinationMessage(
  items: readonly BreakdownItem[],
  itemId: string,
  refs: readonly WbsAllocationRef[],
): string {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) {
    return 'This item is no longer available.';
  }
  const domainItems = toWbsItems(items);
  const reasons = new Set<string>();
  const candidates: Array<string | null> = [null, ...items.map((entry) => entry.id)];
  for (const parentId of candidates) {
    if (parentId === item.parentId) {
      continue;
    }
    const result = validateMoveWbsItem(domainItems, itemId, parentId, refs);
    if (!result.ok) {
      reasons.add(result.error.code);
    }
  }
  if (reasons.size === 0) {
    return 'No valid destination. This item is already in the only valid place in this project.';
  }
  if (reasons.has('depth-exceeded') && !reasons.has('allocated-leaf') && !reasons.has('cycle')) {
    return 'No valid destination. Every move would exceed the three-level limit.';
  }
  if (reasons.has('allocated-leaf') && !reasons.has('depth-exceeded') && !reasons.has('cycle')) {
    return 'No valid destination. The other items have direct allocations.';
  }
  return 'No valid destination. A move would exceed three levels, create a cycle, or place this item under one with direct allocations.';
}

function toWbsItems(items: readonly BreakdownItem[]): WbsItem[] {
  return items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    parentId: item.parentId,
    name: item.name,
  }));
}

function itemPath(items: readonly BreakdownItem[], itemId: string): string {
  const byId = new Map(items.map((item) => [item.id, item]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(itemId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    const parentId = current.parentId;
    current = parentId === null ? undefined : byId.get(parentId);
  }
  return names.join(' / ');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled WBS error: ${JSON.stringify(value)}`);
}
