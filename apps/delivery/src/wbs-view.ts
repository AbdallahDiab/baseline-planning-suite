import type { Allocation, BreakdownItem } from '@baseline/contracts';
import type { WbsAllocationRef } from '@baseline/delivery-domain';

export interface WbsNode {
  item: BreakdownItem;
  depth: number;
  children: readonly WbsNode[];
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
