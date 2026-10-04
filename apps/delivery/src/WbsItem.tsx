import type { BreakdownItem } from '@baseline/contracts';
import type { WbsAllocationRef } from '@baseline/delivery-domain';
import { WbsMoveForm, WbsNameForm } from './WbsForm';
import {
  canAddChild,
  deleteBlockReason,
  hasDirectAllocations,
  moveDestinations,
  noMoveDestinationMessage,
  type WbsNode,
} from './wbs-view';

export type ActiveWbsAction =
  | { kind: 'create-root' }
  | { kind: 'create-child' | 'rename' | 'move' | 'delete'; itemId: string };

export function WbsItem({
  node,
  items,
  allocationRefs,
  active,
  pending,
  error,
  onOpen,
  onCancel,
  onBeginAttempt,
  onCreateChild,
  onRename,
  onMove,
  onDelete,
}: {
  node: WbsNode;
  items: readonly BreakdownItem[];
  allocationRefs: readonly WbsAllocationRef[];
  active: ActiveWbsAction | null;
  pending: boolean;
  error: string | null;
  onOpen: (itemId: string, kind: 'create-child' | 'rename' | 'move' | 'delete') => void;
  onCancel: () => void;
  onBeginAttempt: () => void;
  onCreateChild: (name: string) => void;
  onRename: (name: string) => void;
  onMove: (parentId: string | null) => void;
  onDelete: () => void;
}) {
  const itemId = node.item.id;
  const action = active !== null && active.kind !== 'create-root' && active.itemId === itemId ? active.kind : null;
  const actionsDisabled = pending || (active !== null && action === null);
  const allocated = hasDirectAllocations(allocationRefs, itemId);
  const allowChild = canAddChild(items, itemId, allocationRefs);

  return (
    <li className="wbs-node">
      <div className="wbs-row">
        <span className="wbs-name">{node.item.name}</span>
        <span className="wbs-meta">{node.children.length > 0 ? 'Parent' : 'Leaf'}</span>
        <span className="wbs-meta">Depth {node.depth}</span>
        {allocated ? <span className="wbs-meta">Has direct allocations</span> : null}
      </div>
      <div className="wbs-actions" role="group" aria-label={`Actions for ${node.item.name}`}>
        {action === null ? (
          <>
            {allowChild ? (
              <button type="button" onClick={() => onOpen(itemId, 'create-child')} disabled={actionsDisabled}>
                Add child
              </button>
            ) : null}
            <button type="button" onClick={() => onOpen(itemId, 'rename')} disabled={actionsDisabled}>
              Rename
            </button>
            <button type="button" onClick={() => onOpen(itemId, 'move')} disabled={actionsDisabled}>
              Move
            </button>
            <button type="button" onClick={() => onOpen(itemId, 'delete')} disabled={actionsDisabled}>
              Delete
            </button>
          </>
        ) : null}
        {action === 'create-child' ? (
          <WbsNameForm
            title={`Add child to ${node.item.name}`}
            submitLabel="Add child"
            initialName=""
            pending={pending}
            serverError={error}
            onBeginAttempt={onBeginAttempt}
            onSubmit={onCreateChild}
            onCancel={onCancel}
          />
        ) : null}
        {action === 'rename' ? (
          <WbsNameForm
            title={`Rename ${node.item.name}`}
            submitLabel="Save name"
            initialName={node.item.name}
            pending={pending}
            serverError={error}
            onBeginAttempt={onBeginAttempt}
            onSubmit={onRename}
            onCancel={onCancel}
          />
        ) : null}
        {action === 'move' ? (
          <MoveControls
            items={items}
            itemId={itemId}
            allocationRefs={allocationRefs}
            pending={pending}
            error={error}
            onBeginAttempt={onBeginAttempt}
            onMove={onMove}
            onCancel={onCancel}
          />
        ) : null}
        {action === 'delete' ? (
          <DeleteControls
            items={items}
            item={node.item}
            allocationRefs={allocationRefs}
            pending={pending}
            error={error}
            onDelete={onDelete}
            onCancel={onCancel}
          />
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <WbsItem
              key={child.item.id}
              node={child}
              items={items}
              allocationRefs={allocationRefs}
              active={active}
              pending={pending}
              error={error}
              onOpen={onOpen}
              onCancel={onCancel}
              onBeginAttempt={onBeginAttempt}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MoveControls({
  items,
  itemId,
  allocationRefs,
  pending,
  error,
  onBeginAttempt,
  onMove,
  onCancel,
}: {
  items: readonly BreakdownItem[];
  itemId: string;
  allocationRefs: readonly WbsAllocationRef[];
  pending: boolean;
  error: string | null;
  onBeginAttempt: () => void;
  onMove: (parentId: string | null) => void;
  onCancel: () => void;
}) {
  const destinations = moveDestinations(items, itemId, allocationRefs);
  if (destinations.length === 0) {
    return (
      <div className="wbs-feedback">
        <p role="alert">{noMoveDestinationMessage(items, itemId, allocationRefs)}</p>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <WbsMoveForm
      destinations={destinations}
      pending={pending}
      serverError={error}
      onBeginAttempt={onBeginAttempt}
      onSubmit={onMove}
      onCancel={onCancel}
    />
  );
}

function DeleteControls({
  items,
  item,
  allocationRefs,
  pending,
  error,
  onDelete,
  onCancel,
}: {
  items: readonly BreakdownItem[];
  item: BreakdownItem;
  allocationRefs: readonly WbsAllocationRef[];
  pending: boolean;
  error: string | null;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const reason = deleteBlockReason(items, item.id, allocationRefs);
  if (reason) {
    return (
      <div className="wbs-feedback">
        <p role="alert">{reason}</p>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="wbs-feedback">
      <p>Delete {item.name}?</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="actions">
        <button type="button" onClick={onDelete} disabled={pending}>
          {pending ? 'Deleting…' : 'Confirm'}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
