import type { CapacitySummary } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import { formatCapacityPercent, formatPersonMonths } from './format';
import { useCapacity, useEmployee } from './queries';

export function EmployeeDetail({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const employeeQuery = useEmployee(employeeId);
  const capacityQuery = useCapacity();
  const employee = employeeQuery.data;
  const overCapacityMonths = (capacityQuery.data ?? [])
    .filter((summary) => summary.employeeId === employeeId && summary.overCapacity)
    .sort((left, right) => left.month.localeCompare(right.month));

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
