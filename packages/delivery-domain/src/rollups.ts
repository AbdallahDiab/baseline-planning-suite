import { err, ok } from './result';
import type { DomainResult } from './result';
import { validateWbsTree } from './wbs';
import type { WbsItem, WbsTreeError } from './wbs';

export interface EffortCost {
  personMonths: number;
  cost: number;
}

export interface LeafContribution {
  itemId: string;
  personMonths: number;
  cost: number;
}

export type RollupError =
  | { code: 'invalid-tree'; tree: WbsTreeError }
  | { code: 'unknown-item'; itemId: string }
  | { code: 'not-a-leaf'; itemId: string };

const EMPTY: EffortCost = { personMonths: 0, cost: 0 };

/**
 * Parents and roots are the sum of their descendant leaves.
 * Calculated parent values are not stored allocations.
 */
export function rollupEffortAndCost(
  items: readonly WbsItem[],
  contributions: readonly LeafContribution[],
): DomainResult<ReadonlyMap<string, EffortCost>, RollupError> {
  const tree = validateWbsTree(items);
  if (!tree.ok) {
    return err({ code: 'invalid-tree', tree: tree.error });
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, WbsItem[]>();
  for (const item of items) {
    if (item.parentId === null) {
      continue;
    }
    const siblings = children.get(item.parentId);
    if (siblings) {
      siblings.push(item);
    } else {
      children.set(item.parentId, [item]);
    }
  }

  const leaves = new Map<string, EffortCost>();
  for (const contribution of contributions) {
    const item = byId.get(contribution.itemId);
    if (!item) {
      return err({ code: 'unknown-item', itemId: contribution.itemId });
    }
    if ((children.get(contribution.itemId)?.length ?? 0) > 0) {
      return err({ code: 'not-a-leaf', itemId: contribution.itemId });
    }
    const current = leaves.get(contribution.itemId) ?? EMPTY;
    leaves.set(contribution.itemId, {
      personMonths: current.personMonths + contribution.personMonths,
      cost: current.cost + contribution.cost,
    });
  }

  const rolled = new Map<string, EffortCost>();
  const visit = (itemId: string): EffortCost => {
    const cached = rolled.get(itemId);
    if (cached) {
      return cached;
    }
    const kids = children.get(itemId) ?? [];
    const leafTotal = leaves.get(itemId) ?? EMPTY;
    const total =
      kids.length === 0
        ? { personMonths: leafTotal.personMonths, cost: leafTotal.cost }
        : kids.reduce<EffortCost>((sum, child) => {
            const childTotal = visit(child.id);
            return {
              personMonths: sum.personMonths + childTotal.personMonths,
              cost: sum.cost + childTotal.cost,
            };
          }, EMPTY);
    rolled.set(itemId, total);
    return total;
  };
  for (const item of items) {
    visit(item.id);
  }
  return ok(rolled);
}
