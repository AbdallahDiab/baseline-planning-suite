import { WEEKLY_HOURS } from '@baseline/contracts';
import type { WeeklyHours } from '@baseline/contracts';
import type { Allocation, BreakdownItem, Employee, Project, RateRecord } from '@baseline/contracts';
import type { StoreMeta, WorkingStore } from './model';

export function normalizeSeed(input: unknown): WorkingStore {
  return parseStore(input, 'seed', false);
}

export function parseWorkingStore(input: unknown): WorkingStore {
  return parseStore(input, 'working store', true);
}

function parseStore(input: unknown, label: string, requireUpdatedAt: boolean): WorkingStore {
  const root = expectRecord(input, label);
  return {
    meta: readMeta(root.meta, `${label}.meta`),
    employees: expectArray(root.employees, `${label}.employees`).map((entry, index) =>
      readEmployee(entry, `${label}.employees[${index}]`),
    ),
    rateRecords: expectArray(root.rateRecords, `${label}.rateRecords`).map((entry, index) =>
      readRate(entry, `${label}.rateRecords[${index}]`),
    ),
    projects: expectArray(root.projects, `${label}.projects`).map((entry, index) =>
      readProject(entry, `${label}.projects[${index}]`),
    ),
    breakdownItems: expectArray(root.breakdownItems, `${label}.breakdownItems`).map((entry, index) =>
      readBreakdownItem(entry, `${label}.breakdownItems[${index}]`),
    ),
    allocations: expectArray(root.allocations, `${label}.allocations`).map((entry, index) =>
      readAllocation(entry, `${label}.allocations[${index}]`, requireUpdatedAt),
    ),
  };
}

function readMeta(value: unknown, label: string): StoreMeta {
  const record = expectRecord(value, label);
  const horizon = expectRecord(record.gridHorizon, `${label}.gridHorizon`);
  return {
    name: readString(record, 'name', label),
    version: readString(record, 'version', label),
    gridHorizon: {
      from: readString(horizon, 'from', `${label}.gridHorizon`),
      to: readString(horizon, 'to', `${label}.gridHorizon`),
    },
    note: readString(record, 'note', label),
  };
}

function readEmployee(value: unknown, label: string): Employee {
  const record = expectRecord(value, label);
  return {
    id: readString(record, 'id', label),
    name: readString(record, 'name', label),
    role: readString(record, 'role', label),
    weeklyHours: readWeeklyHours(record.weeklyHours, label),
  };
}

function readRate(value: unknown, label: string): RateRecord {
  const record = expectRecord(value, label);
  return {
    id: readString(record, 'id', label),
    employeeId: readString(record, 'employeeId', label),
    validFrom: readString(record, 'validFrom', label),
    hourlyCost: readFiniteNumber(record, 'hourlyCost', label),
  };
}

function readProject(value: unknown, label: string): Project {
  const record = expectRecord(value, label);
  return {
    id: readString(record, 'id', label),
    name: readString(record, 'name', label),
    startDate: readString(record, 'startDate', label),
    endDate: readString(record, 'endDate', label),
  };
}

function readBreakdownItem(value: unknown, label: string): BreakdownItem {
  const record = expectRecord(value, label);
  return {
    id: readString(record, 'id', label),
    projectId: readString(record, 'projectId', label),
    parentId: readParentId(record.parentId, label),
    name: readString(record, 'name', label),
  };
}

function readAllocation(value: unknown, label: string, requireUpdatedAt: boolean): Allocation {
  const record = expectRecord(value, label);
  return {
    id: readString(record, 'id', label),
    breakdownItemId: readString(record, 'breakdownItemId', label),
    employeeId: readString(record, 'employeeId', label),
    month: readString(record, 'month', label),
    amount: readFiniteNumber(record, 'amount', label),
    updatedAt: readSeedUpdatedAt(record, label, requireUpdatedAt),
  };
}

function readSeedUpdatedAt(
  record: Record<string, unknown>,
  label: string,
  requireUpdatedAt: boolean,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, 'updatedAt')) {
    if (requireUpdatedAt) {
      throw new Error(`${label}.updatedAt is required`);
    }
    return null;
  }
  return readUpdatedAt(record.updatedAt, label);
}

function readUpdatedAt(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new Error(`${label}.updatedAt must be an ISO timestamp or null`);
}

function readWeeklyHours(value: unknown, label: string): WeeklyHours {
  if (typeof value === 'number' && WEEKLY_HOURS.some((hours) => hours === value)) {
    return value as WeeklyHours;
  }
  throw new Error(`${label}.weeklyHours must be 20, 32, or 40`);
}

function readParentId(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new Error(`${label}.parentId must be a string or null`);
}

function readFiniteNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a finite number`);
  }
  return value;
}

function readString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}.${key} must be a string`);
  }
  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
