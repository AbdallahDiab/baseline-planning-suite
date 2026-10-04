import type { WbsAllocationRef } from '@baseline/delivery-domain';
import { hasDirectAllocations, type WbsNode } from './wbs-view';

export function WbsItem({
  node,
  allocationRefs,
}: {
  node: WbsNode;
  allocationRefs: readonly WbsAllocationRef[];
}) {
  const allocated = hasDirectAllocations(allocationRefs, node.item.id);

  return (
    <li className="wbs-node">
      <div className="wbs-row">
        <span className="wbs-name">{node.item.name}</span>
        <span className="wbs-meta">{node.children.length > 0 ? 'Parent' : 'Leaf'}</span>
        <span className="wbs-meta">Depth {node.depth}</span>
        {allocated ? <span className="wbs-meta">Has direct allocations</span> : null}
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <WbsItem key={child.item.id} node={child} allocationRefs={allocationRefs} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
