import { useRef, useState } from 'react';
import type { Allocation, BreakdownItem } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import { useCreateWbsItem, useDeleteWbsItem, useMoveWbsItem, useRenameWbsItem } from './queries';
import { WbsNameForm } from './WbsForm';
import { WbsItem, type ActiveWbsAction } from './WbsItem';
import { buildWbsTree, toAllocationRefs } from './wbs-view';

export function WbsTree({
  projectId,
  items,
  allocations,
}: {
  projectId: string;
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
}) {
  const allocationRefs = toAllocationRefs(allocations);
  const nodes = buildWbsTree(items);
  const createItem = useCreateWbsItem(projectId);
  const renameItem = useRenameWbsItem(projectId);
  const moveItem = useMoveWbsItem(projectId);
  const deleteItem = useDeleteWbsItem(projectId);
  const [active, setActive] = useState<ActiveWbsAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteLock = useRef(false);
  const pending = createItem.isPending || renameItem.isPending || moveItem.isPending || deleteItem.isPending;

  function open(next: ActiveWbsAction) {
    if (pending || active !== null) {
      return;
    }
    setError(null);
    setActive(next);
  }

  function cancel() {
    if (pending) {
      return;
    }
    setError(null);
    setActive(null);
  }

  function beginAttempt() {
    setError(null);
  }

  function create(parentId: string | null, name: string) {
    setError(null);
    createItem.mutate(
      { parentId, name },
      {
        onSuccess: () => {
          setActive(null);
          setError(null);
        },
        onError: (mutationError) => {
          setError(requestErrorMessage(mutationError));
        },
      },
    );
  }

  function rename(name: string) {
    if (active?.kind !== 'rename') {
      return;
    }
    setError(null);
    renameItem.mutate(
      { itemId: active.itemId, name },
      {
        onSuccess: () => {
          setActive(null);
          setError(null);
        },
        onError: (mutationError) => {
          setError(requestErrorMessage(mutationError));
        },
      },
    );
  }

  function move(parentId: string | null) {
    if (active?.kind !== 'move') {
      return;
    }
    setError(null);
    moveItem.mutate(
      { itemId: active.itemId, parentId },
      {
        onSuccess: () => {
          setActive(null);
          setError(null);
        },
        onError: (mutationError) => {
          setError(requestErrorMessage(mutationError));
        },
      },
    );
  }

  function remove() {
    if (active?.kind !== 'delete' || deleteLock.current || deleteItem.isPending) {
      return;
    }
    deleteLock.current = true;
    setError(null);
    deleteItem.mutate(active.itemId, {
      onSuccess: () => {
        setActive(null);
        setError(null);
      },
      onError: (mutationError) => {
        setError(requestErrorMessage(mutationError));
      },
      onSettled: () => {
        deleteLock.current = false;
      },
    });
  }

  return (
    <div className="wbs-workspace">
      {active?.kind === 'create-root' ? (
        <WbsNameForm
          title="Add root item"
          submitLabel="Add root item"
          initialName=""
          pending={pending}
          serverError={error}
          onBeginAttempt={beginAttempt}
          onSubmit={(name) => {
            create(null, name);
          }}
          onCancel={cancel}
        />
      ) : (
        <p>
          <button
            type="button"
            onClick={() => {
              open({ kind: 'create-root' });
            }}
            disabled={pending || active !== null}
          >
            Add root item
          </button>
        </p>
      )}
      {nodes.length === 0 ? (
        <p>This project has no work breakdown items yet.</p>
      ) : (
        <ul className="wbs-tree" aria-label="Work breakdown structure">
          {nodes.map((node) => (
            <WbsItem
              key={node.item.id}
              node={node}
              items={items}
              allocationRefs={allocationRefs}
              active={active}
              pending={pending}
              error={error}
              onOpen={(itemId, kind) => {
                open({ kind, itemId });
              }}
              onCancel={cancel}
              onBeginAttempt={beginAttempt}
              onCreateChild={(name) => {
                if (active?.kind !== 'create-child') {
                  return;
                }
                create(active.itemId, name);
              }}
              onRename={rename}
              onMove={move}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
