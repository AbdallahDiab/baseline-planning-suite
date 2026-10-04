import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RateWrite } from './api';

export function RateForm({
  title,
  initialValidFrom,
  initialHourlyCost,
  pending,
  serverError,
  onBeginAttempt,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialValidFrom: string;
  initialHourlyCost: string;
  pending: boolean;
  serverError: string | null;
  onBeginAttempt: () => void;
  onSubmit: (rate: RateWrite) => void;
  onCancel: () => void;
}) {
  const [validFrom, setValidFrom] = useState(initialValidFrom);
  const [hourlyCost, setHourlyCost] = useState(initialHourlyCost);
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
    const nextError = validateRate(validFrom, hourlyCost);
    if (nextError) {
      setFieldError(nextError);
      return;
    }
    submitLock.current = true;
    setFieldError(null);
    onSubmit({
      validFrom,
      hourlyCost: Number(hourlyCost.trim()),
    });
  }

  return (
    <form className="rate-form" noValidate onSubmit={handleSubmit}>
      <h3>{title}</h3>
      <label htmlFor="rate-valid-from">
        Valid from
        <input
          id="rate-valid-from"
          type="date"
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
          disabled={pending}
          required
        />
      </label>
      <label htmlFor="rate-hourly-cost">
        Hourly cost
        <input
          id="rate-hourly-cost"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={hourlyCost}
          onChange={(event) => {
            setHourlyCost(event.target.value);
          }}
          disabled={pending}
          required
        />
      </label>
      {fieldError ? <p role="alert">{fieldError}</p> : null}
      {serverError ? <p role="alert">{serverError}</p> : null}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save rate'}
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function validateRate(validFrom: string, hourlyCost: string): string | null {
  if (validFrom.trim().length === 0) {
    return 'Valid from is required.';
  }
  const trimmedCost = hourlyCost.trim();
  if (trimmedCost.length === 0) {
    return 'Hourly cost is required.';
  }
  const amount = Number(trimmedCost);
  if (!Number.isFinite(amount)) {
    return 'Hourly cost must be a finite number.';
  }
  if (amount < 0) {
    return 'Hourly cost must be zero or greater.';
  }
  return null;
}
