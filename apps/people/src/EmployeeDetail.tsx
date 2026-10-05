import { useRef, useState } from 'react';
import type { CapacitySummary, DisplayCurrency, PlanningEventBus, RateRecord } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import type { RateWrite } from './api';
import { formatCapacityPercent, formatHourlyCost, formatPersonMonths, sortRatesDescending } from './format';
import { useCapacity, useCreateRate, useDeleteRate, useEmployee, useRates, useUpdateRate } from './queries';
import { RateForm } from './RateForm';

type RateEditor = { mode: 'create' } | { mode: 'edit'; rate: RateRecord };

export function EmployeeDetail({
  employeeId,
  displayCurrency,
  planningEvents,
  onBack,
}: {
  employeeId: string;
  displayCurrency: DisplayCurrency;
  planningEvents?: PlanningEventBus;
  onBack: () => void;
}) {
  const employeeQuery = useEmployee(employeeId);
  const capacityQuery = useCapacity();
  const ratesQuery = useRates(employeeId);
  const createRate = useCreateRate(employeeId, planningEvents);
  const updateRate = useUpdateRate(employeeId, planningEvents);
  const deleteRate = useDeleteRate(employeeId, planningEvents);
  const [editor, setEditor] = useState<RateEditor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmingRateId, setConfirmingRateId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteLock = useRef(false);

  const employee = employeeQuery.data;
  const saving = createRate.isPending || updateRate.isPending;
  const rates = ratesQuery.data ? sortRatesDescending(ratesQuery.data) : undefined;
  const overCapacityMonths = (capacityQuery.data ?? [])
    .filter((summary) => summary.employeeId === employeeId && summary.overCapacity)
    .sort((left, right) => left.month.localeCompare(right.month));

  function beginCreate() {
    if (saving || deleteRate.isPending) {
      return;
    }
    setConfirmingRateId(null);
    setEditorError(null);
    setEditor({ mode: 'create' });
  }

  function beginEdit(rate: RateRecord) {
    if (saving || deleteRate.isPending) {
      return;
    }
    setConfirmingRateId(null);
    setEditorError(null);
    setEditor({ mode: 'edit', rate });
  }

  function submitRate(rate: RateWrite) {
    setEditorError(null);
    if (!editor || editor.mode === 'create') {
      createRate.mutate(rate, {
        onSuccess: () => {
          setEditor(null);
          setEditorError(null);
        },
        onError: (error) => {
          setEditorError(requestErrorMessage(error));
        },
      });
      return;
    }
    updateRate.mutate(
      { rateId: editor.rate.id, rate },
      {
        onSuccess: () => {
          setEditor(null);
          setEditorError(null);
        },
        onError: (error) => {
          setEditorError(requestErrorMessage(error));
        },
      },
    );
  }

  function confirmDelete(rateId: string) {
    if (deleteLock.current || deleteRate.isPending) {
      return;
    }
    deleteLock.current = true;
    setDeleteError(null);
    deleteRate.mutate(rateId, {
      onSuccess: () => {
        setConfirmingRateId((current) => (current === rateId ? null : current));
        setDeleteError(null);
        setEditor((current) => (current?.mode === 'edit' && current.rate.id === rateId ? null : current));
      },
      onError: (error) => {
        setDeleteError(requestErrorMessage(error));
      },
      onSettled: () => {
        deleteLock.current = false;
      },
    });
  }

  return (
    <div>
      <p>
        <button type="button" onClick={onBack}>
          Back to employees
        </button>
      </p>

      {employeeQuery.isPending ? <p>Loading employee…</p> : null}
      {employeeQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(employeeQuery.error)}</p>
          <button
            type="button"
            onClick={() => {
              void employeeQuery.refetch();
            }}
            disabled={employeeQuery.isFetching}
          >
            Retry
          </button>
        </div>
      ) : null}

      {employee ? (
        <>
          <h3>Employee</h3>
          <dl className="details">
            <div>
              <dt>Name</dt>
              <dd>{employee.name}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{employee.role}</dd>
            </div>
            <div>
              <dt>Weekly hours</dt>
              <dd>{employee.weeklyHours}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <h3>Capacity</h3>
      {capacityQuery.isPending ? <p>Loading capacity…</p> : null}
      {capacityQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(capacityQuery.error)}</p>
          <button
            type="button"
            onClick={() => {
              void capacityQuery.refetch();
            }}
            disabled={capacityQuery.isFetching}
          >
            Retry capacity
          </button>
        </div>
      ) : null}
      {capacityQuery.data && overCapacityMonths.length === 0 ? <p>No over-capacity months.</p> : null}
      {overCapacityMonths.length > 0 ? <CapacityMonths months={overCapacityMonths} /> : null}

      <h3>Rate history</h3>
      {ratesQuery.isPending ? <p>Loading rates…</p> : null}
      {ratesQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(ratesQuery.error)}</p>
          <button
            type="button"
            onClick={() => {
              void ratesQuery.refetch();
            }}
            disabled={ratesQuery.isFetching}
          >
            Retry rates
          </button>
        </div>
      ) : null}
      {deleteError ? <p role="alert">{deleteError}</p> : null}
      {rates && rates.length === 0 ? <p>No rates recorded.</p> : null}
      {rates && rates.length > 0 ? (
        <table>
          <caption>Rates</caption>
          <thead>
            <tr>
              <th scope="col">Valid from</th>
              <th scope="col">Hourly cost</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id}>
                <td>{rate.validFrom}</td>
                <td>{formatHourlyCost(rate.hourlyCost, displayCurrency)}</td>
                <td>
                  {confirmingRateId === rate.id ? (
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => {
                          confirmDelete(rate.id);
                        }}
                        disabled={deleteRate.isPending}
                      >
                        {deleteRate.isPending ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingRateId(null);
                          setDeleteError(null);
                        }}
                        disabled={deleteRate.isPending}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => {
                          beginEdit(rate);
                        }}
                        disabled={saving || deleteRate.isPending}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (deleteRate.isPending) {
                            return;
                          }
                          setDeleteError(null);
                          setConfirmingRateId(rate.id);
                        }}
                        disabled={saving || deleteRate.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {editor ? (
        <RateForm
          key={editor.mode === 'edit' ? editor.rate.id : 'create'}
          title={editor.mode === 'edit' ? 'Edit rate' : 'Add rate'}
          initialValidFrom={editor.mode === 'edit' ? editor.rate.validFrom : ''}
          initialHourlyCost={editor.mode === 'edit' ? String(editor.rate.hourlyCost) : ''}
          pending={saving}
          serverError={editorError}
          onBeginAttempt={() => {
            setEditorError(null);
          }}
          onSubmit={submitRate}
          onCancel={() => {
            if (saving) {
              return;
            }
            setEditor(null);
            setEditorError(null);
          }}
        />
      ) : (
        <p>
          <button type="button" onClick={beginCreate} disabled={deleteRate.isPending}>
            Add rate
          </button>
        </p>
      )}
    </div>
  );
}

function CapacityMonths({ months }: { months: CapacitySummary[] }) {
  return (
    <table>
      <caption>Over-capacity months</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Person-months</th>
          <th scope="col">Capacity</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month) => (
          <tr key={month.month}>
            <td>{month.month}</td>
            <td>{formatPersonMonths(month.totalPersonMonths)}</td>
            <td>{formatCapacityPercent(month.totalPersonMonths)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
