import { useDeferredValue, useState } from 'react';
import { requestErrorMessage } from './api';
import { useCapacity, useEmployees } from './queries';

export function EmployeeRegister({ onOpen }: { onOpen: (employeeId: string) => void }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const employeesQuery = useEmployees(deferredSearch);
  const capacityQuery = useCapacity();
  const employees = employeesQuery.data;

  return (
    <div>
      <div className="toolbar">
        <label htmlFor="employee-search">Search employees</label>
        <input
          id="employee-search"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>

      {employeesQuery.isPending ? <p>Loading employees…</p> : null}
      {employeesQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(employeesQuery.error)}</p>
          <button
            type="button"
            onClick={() => {
              void employeesQuery.refetch();
            }}
            disabled={employeesQuery.isFetching}
          >
            Retry
          </button>
        </div>
      ) : null}

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

      {employees && employees.length === 0 ? <p>No employees match this search.</p> : null}

      {employees && employees.length > 0 ? (
        <table>
          <caption>Employees</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Weekly hours</th>
              <th scope="col">Capacity</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const overCapacity = isOverCapacity(employee.id, capacityQuery.data);
              const capacityText = capacityLabel(capacityQuery.isPending, capacityQuery.isError, overCapacity);
              return (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.role}</td>
                  <td>{employee.weeklyHours}</td>
                  <td className={overCapacity ? 'capacity-over' : undefined}>{capacityText}</td>
                  <td>
                    <button type="button" onClick={() => onOpen(employee.id)}>
                      Open {employee.name}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function isOverCapacity(
  employeeId: string,
  summaries: ReadonlyArray<{ employeeId: string; overCapacity: boolean }> | undefined,
): boolean {
  if (!summaries) {
    return false;
  }
  return summaries.some((summary) => summary.employeeId === employeeId && summary.overCapacity);
}

function capacityLabel(isPending: boolean, isError: boolean, overCapacity: boolean): string {
  if (isPending) {
    return 'Checking capacity…';
  }
  if (isError) {
    return 'Unavailable';
  }
  return overCapacity ? 'Over capacity' : 'Within capacity';
}
