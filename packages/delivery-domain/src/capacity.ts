import type { DomainAllocation } from './allocation';
import { compareInstant } from './timestamps';

export interface CapacityCause {
  allocationId: string;
  updatedAt: string;
}

export interface EmployeeMonthCapacity {
  employeeId: string;
  month: string;
  personMonths: number;
  oversubscribed: boolean;
  /**
   * The most recently edited allocation that contributes person-months.
   * A zero person-month row stays in the total and is not eligible as the cause.
   * Null when the month is not oversubscribed, and when every positive
   * contributor is still unedited (`updatedAt === null`).
   */
  cause: CapacityCause | null;
}

/** Exactly 1 person-month is 100% capacity and is not oversubscribed. */
export function isOversubscribed(personMonths: number): boolean {
  return personMonths > 1;
}

/**
 * Sum every supplied allocation for each employee and month.
 * Pass allocations from every project. This function does not filter by project.
 */
export function summarizeEmployeeCapacity(
  allocations: readonly DomainAllocation[],
): EmployeeMonthCapacity[] {
  const groups = new Map<string, DomainAllocation[]>();
  for (const allocation of allocations) {
    const key = `${allocation.employeeId}\u0000${allocation.month}`;
    const group = groups.get(key);
    if (group) {
      group.push(allocation);
    } else {
      groups.set(key, [allocation]);
    }
  }

  const summaries: EmployeeMonthCapacity[] = [];
  for (const group of groups.values()) {
    const sample = group[0];
    if (!sample) {
      continue;
    }
    const personMonths = group.reduce((sum, allocation) => sum + allocation.personMonths, 0);
    const oversubscribed = isOversubscribed(personMonths);
    summaries.push({
      employeeId: sample.employeeId,
      month: sample.month,
      personMonths,
      oversubscribed,
      cause: oversubscribed ? editedCause(group) : null,
    });
  }

  summaries.sort((left, right) => {
    if (left.employeeId < right.employeeId) {
      return -1;
    }
    if (left.employeeId > right.employeeId) {
      return 1;
    }
    if (left.month < right.month) {
      return -1;
    }
    if (left.month > right.month) {
      return 1;
    }
    return 0;
  });
  return summaries;
}

function editedCause(group: readonly DomainAllocation[]): CapacityCause | null {
  const edited = group.filter(
    (allocation) => allocation.updatedAt !== null && allocation.personMonths > 0,
  );
  if (edited.length === 0) {
    return null;
  }
  const ranked = [...edited].sort((left, right) => {
    const leftEdited = left.updatedAt;
    const rightEdited = right.updatedAt;
    if (leftEdited === null || rightEdited === null) {
      return 0;
    }
    const byTime = compareInstant(rightEdited, leftEdited);
    if (byTime !== 0) {
      return byTime;
    }
    if (left.id < right.id) {
      return 1;
    }
    if (left.id > right.id) {
      return -1;
    }
    return 0;
  });
  const winner = ranked[0];
  if (!winner || winner.updatedAt === null) {
    return null;
  }
  return { allocationId: winner.id, updatedAt: winner.updatedAt };
}
