import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MoveDestination } from './wbs-view';

export function WbsNameForm({
  title,
  submitLabel,
  initialName,
  pending,
  serverError,
  onBeginAttempt,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  initialName: string;
  pending: boolean;
  serverError: string | null;
  onBeginAttempt: () => void;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!pending) {
      submitLock.current = false;
    }
  }, [pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitLock.current) {
      return;
    }
    onBeginAttempt();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFieldError('Name is required.');
      return;
    }
    submitLock.current = true;
    setFieldError(null);
    onSubmit(trimmed);
  }

  return (
    <form className="wbs-form" noValidate onSubmit={handleSubmit}>
      <h3>{title}</h3>
      <label htmlFor="wbs-item-name">
        Name
        <input
          id="wbs-item-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          disabled={pending}
          required
        />
      </label>
      {fieldError ? <p role="alert">{fieldError}</p> : null}
      {serverError ? <p role="alert">{serverError}</p> : null}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function WbsMoveForm({
  destinations,
  pending,
  serverError,
  onBeginAttempt,
  onSubmit,
  onCancel,
}: {
  destinations: readonly MoveDestination[];
  pending: boolean;
  serverError: string | null;
  onBeginAttempt: () => void;
  onSubmit: (parentId: string | null) => void;
  onCancel: () => void;
}) {
  const [parentKey, setParentKey] = useState(destinationKey(destinations[0]?.parentId ?? null));
  const submitLock = useRef(false);

  useEffect(() => {
    if (!pending) {
      submitLock.current = false;
    }
  }, [pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitLock.current) {
      return;
    }
    onBeginAttempt();
    submitLock.current = true;
    onSubmit(parentKey === '' ? null : parentKey);
  }

  return (
    <form className="wbs-form" onSubmit={handleSubmit}>
      <h3>Move item</h3>
      <label htmlFor="wbs-move-destination">
        Destination
        <select
          id="wbs-move-destination"
          value={parentKey}
          onChange={(event) => {
            setParentKey(event.target.value);
          }}
          disabled={pending}
        >
          {destinations.map((destination) => (
            <option key={destinationKey(destination.parentId) || 'root'} value={destinationKey(destination.parentId)}>
              {destination.label}
            </option>
          ))}
        </select>
      </label>
      {serverError ? <p role="alert">{serverError}</p> : null}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Move item'}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function destinationKey(parentId: string | null): string {
  return parentId ?? '';
}
