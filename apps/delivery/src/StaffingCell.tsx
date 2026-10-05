import type { CapacityCellMarker } from './capacity-display';
import type { StaffingDisplayCell } from './staffing-view';
import { monthColumnLabel } from './staffing-view';

export function StaffingCell({
  cell,
  employeeName,
  capacity,
  readOnly,
  editing,
  value,
  error,
  pending,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: {
  cell: StaffingDisplayCell;
  employeeName: string;
  capacity: CapacityCellMarker | null;
  readOnly: boolean;
  editing: boolean;
  value: string;
  error: string | null;
  pending: boolean;
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const monthLabel = monthColumnLabel(cell.month);
  const fieldLabel = `Allocation for ${employeeName} in ${monthLabel}`;

  return (
    <div className={readOnly ? 'staff-cell staff-derived' : 'staff-cell'}>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            {fieldLabel}
            <input
              type="number"
              min="0"
              step="any"
              value={value}
              disabled={pending}
              onChange={(event) => {
                onChange(event.target.value);
              }}
            />
          </label>
          {error ? (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <button type="submit" disabled={pending}>
              {pending ? 'Saving…' : `Save ${employeeName} ${monthLabel}`}
            </button>
            <button type="button" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <span className="staff-amount">{cell.text}</span>
          {cell.coverageLabel ? <span className="staff-coverage">{cell.coverageLabel}</span> : null}
          {capacity ? (
            <>
              <span className="staff-capacity">Over capacity</span>
              <span className="staff-capacity-total">{capacity.totalLabel}</span>
              <span className="staff-capacity-total">{capacity.percentLabel}</span>
              {capacity.causeName ? <span className="staff-cause">Cause: {capacity.causeName}</span> : null}
            </>
          ) : null}
          {readOnly ? null : (
            <button type="button" onClick={onEdit}>
              {`Edit ${employeeName} ${monthLabel}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
