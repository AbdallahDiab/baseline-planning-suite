import type { Allocation, BreakdownItem } from '@baseline/contracts';
import { WbsItem } from './WbsItem';
import { buildWbsTree, toAllocationRefs } from './wbs-view';

export function WbsTree({
  items,
  allocations,
}: {
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
}) {
  const allocationRefs = toAllocationRefs(allocations);
  const nodes = buildWbsTree(items);

  if (nodes.length === 0) {
    return <p>This project has no work breakdown items yet.</p>;
  }

  return (
    <ul className="wbs-tree" aria-label="Work breakdown structure">
      {nodes.map((node) => (
        <WbsItem key={node.item.id} node={node} allocationRefs={allocationRefs} />
      ))}
    </ul>
  );
}
