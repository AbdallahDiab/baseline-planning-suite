import { useRef, useState } from 'react';
import type { Allocation, BreakdownItem, DisplayCurrency, Employee, RateRecord } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import { useSaveAllocation } from './queries';
import { StaffingCell } from './StaffingCell';
import {
  STAFFING_UNITS,
  buildStaffingGrid,
  editInputValue,
  hourlyRatesForEmployee,
  monthColumnLabel,
  personMonthsFromEdit,
  type StaffingUnit,
} from './staffing-view';

const UNIT_LABELS: Record<StaffingUnit, string> = {
  pm: 'PM',
  hours: 'Hours',
  percent: '%',
  cost: 'Cost',
};

interface EditorState {
  employeeId: string;
  month: string;
  value: string;
  error: string | null;
  itemId: string;
}

export function StaffingGrid({
  projectId,
  project,
  items,
  allocations,
  employees,
  rates,
  selectedItemId,
  displayCurrency,
}: {
  projectId: string;
  project: { startDate: string; endDate: string };
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
  employees: readonly Employee[];
  rates: readonly RateRecord[];
  selectedItemId: string;
  displayCurrency: DisplayCurrency;
}) {
  const [unit, setUnit] = useState<StaffingUnit>('pm');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const saveLock = useRef(false);
  const saveAllocation = useSaveAllocation(projectId);
  const activeEditor = editor !== null && editor.itemId === selectedItemId ? editor : null;

  const model = buildStaffingGrid({
    project,
    items,
    allocations,
    employees,
    rates,
    selectedItemId,
    unit,
    currency: displayCurrency,
  });

  if (!model.ok) {
    return <p role="alert">{model.message}</p>;
  }

  const grid = model.grid;
  if (grid.rows.length === 0) {
    return <p>No employees are available.</p>;
  }

  function selectUnit(next: StaffingUnit) {
    setUnit(next);
    setEditor(null);
  }

  function openEditor(employee: Employee, month: string, exact: number) {
    if (grid.readOnly || saveAllocation.isPending) {
      return;
    }
    setEditor({
      employeeId: employee.id,
      month,
      value: editInputValue(exact),
      error: null,
      itemId: selectedItemId,
    });
  }

  function saveEditor() {
    if (!activeEditor || saveAllocation.isPending || saveLock.current || grid.readOnly) {
      return;
    }
    const employee = employees.find((entry) => entry.id === activeEditor.employeeId);
    if (!employee) {
      setEditor({ ...activeEditor, error: 'This employee is no longer available.' });
      return;
    }
    const converted = personMonthsFromEdit({
      unit,
      raw: activeEditor.value,
      month: activeEditor.month,
      weeklyHours: employee.weeklyHours,
      rates: hourlyRatesForEmployee(rates, employee.id),
    });
    if (!converted.ok) {
      setEditor({ ...activeEditor, error: converted.message });
      return;
    }
    const editorSnapshot = activeEditor;
    saveLock.current = true;
    saveAllocation.mutate(
      {
        breakdownItemId: selectedItemId,
        employeeId: editorSnapshot.employeeId,
        month: editorSnapshot.month,
        amount: converted.personMonths,
      },
      {
        onSuccess: () => {
          setEditor((current) =>
            current &&
            current.employeeId === editorSnapshot.employeeId &&
            current.month === editorSnapshot.month &&
            current.itemId === selectedItemId
              ? null
              : current,
          );
        },
        onError: (error) => {
          setEditor((current) =>
            current &&
            current.employeeId === editorSnapshot.employeeId &&
            current.month === editorSnapshot.month
              ? { ...current, error: requestErrorMessage(error) }
              : current,
          );
        },
        onSettled: () => {
          saveLock.current = false;
        },
      },
    );
  }

  return (
    <div className="staffing-panel">
      <p>
        {grid.readOnly
          ? `${grid.selectedName} is derived from descendant allocations and cannot be edited.`
          : `Direct allocations for ${grid.selectedName}.`}
      </p>
      <div className="staffing-units" role="group" aria-label="Allocation unit">
        {STAFFING_UNITS.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={unit === entry}
            onClick={() => {
              selectUnit(entry);
            }}
          >
            {UNIT_LABELS[entry]}
          </button>
        ))}
      </div>
      <div className="staffing-scroll">
        <table className="staffing-grid">
          <caption>{`Staffing for ${grid.selectedName}`}</caption>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              {grid.months.map((month) => (
                <th key={month} scope="col">
                  {monthColumnLabel(month)}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.employee.id}>
                <th scope="row">
                  <span className="staff-name">{row.employee.name}</span>
                  <span className="staff-meta">{row.employee.role}</span>
                  <span className="staff-meta">{row.employee.weeklyHours} h/week</span>
                </th>
                {row.cells.map((cell) => {
                  const editing =
                    activeEditor !== null &&
                    activeEditor.employeeId === cell.employeeId &&
                    activeEditor.month === cell.month;
                  return (
                    <td key={cell.month}>
                      <StaffingCell
                        cell={cell}
                        employeeName={row.employee.name}
                        readOnly={grid.readOnly}
                        editing={editing}
                        value={editing && activeEditor ? activeEditor.value : ''}
                        error={editing && activeEditor ? activeEditor.error : null}
                        pending={saveAllocation.isPending}
                        onEdit={() => {
                          openEditor(row.employee, cell.month, cell.exact);
                        }}
                        onChange={(value) => {
                          setEditor((current) => (current ? { ...current, value, error: null } : current));
                        }}
                        onSave={saveEditor}
                        onCancel={() => {
                          if (!saveAllocation.isPending) {
                            setEditor(null);
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className="staff-total">
                  <span className="staff-amount">{row.total.text}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {grid.columnTotals.map((column) => (
                <td key={column.month} className="staff-total">
                  <span className="staff-amount">{column.text}</span>
                </td>
              ))}
              <td className="staff-total">
                <span className="staff-amount">{grid.grandTotal.text}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
