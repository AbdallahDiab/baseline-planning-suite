import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatCapacityPercent,
  formatHourlyRate,
  hoursForPersonMonths,
  priceMonthlyAllocation,
} from './index';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/baseline-seed.json',
);

interface EmployeeRecord {
  id: string;
  weeklyHours: number;
}

interface RateRecord {
  id: string;
  employeeId: string;
  validFrom: string;
  hourlyCost: number;
}

interface AllocationRecord {
  id: string;
  employeeId: string;
  month: string;
  amount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Expected string field ${key}`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number') {
    throw new Error(`Expected number field ${key}`);
  }
  return value;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array field ${label}`);
  }
  return value;
}

function loadFixture(): {
  employees: EmployeeRecord[];
  rateRecords: RateRecord[];
  allocations: AllocationRecord[];
} {
  const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('Fixture root is not an object');
  }

  const employees = readArray(parsed.employees, 'employees').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Employee entry is not an object');
    }
    return {
      id: readString(entry, 'id'),
      weeklyHours: readNumber(entry, 'weeklyHours'),
    };
  });

  const rateRecords = readArray(parsed.rateRecords, 'rateRecords').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Rate entry is not an object');
    }
    return {
      id: readString(entry, 'id'),
      employeeId: readString(entry, 'employeeId'),
      validFrom: readString(entry, 'validFrom'),
      hourlyCost: readNumber(entry, 'hourlyCost'),
    };
  });

  const allocations = readArray(parsed.allocations, 'allocations').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Allocation entry is not an object');
    }
    return {
      id: readString(entry, 'id'),
      employeeId: readString(entry, 'employeeId'),
      month: readString(entry, 'month'),
      amount: readNumber(entry, 'amount'),
    };
  });

  return { employees, rateRecords, allocations };
}

function requireById<T extends { id: string }>(records: readonly T[], id: string): T {
  const found = records.find((record) => record.id === id);
  if (!found) {
    throw new Error(`Missing fixture id ${id}`);
  }
  return found;
}

describe('official March 2026 pricing reference', () => {
  const fixture = loadFixture();
  const employee = requireById(fixture.employees, 'emp-001');
  const allocation = requireById(fixture.allocations, 'alloc-001');
  const rates = ['rate-001', 'rate-002'].map((id) => requireById(fixture.rateRecords, id));

  it('reads the official fixture records', () => {
    expect(employee.weeklyHours).toBe(40);
    expect(allocation).toMatchObject({
      id: 'alloc-001',
      employeeId: 'emp-001',
      month: '2026-03',
      amount: 0.5,
    });
    expect(rates).toEqual([
      {
        id: 'rate-001',
        employeeId: 'emp-001',
        validFrom: '2025-01-01',
        hourlyCost: 80,
      },
      {
        id: 'rate-002',
        employeeId: 'emp-001',
        validFrom: '2026-03-12',
        hourlyCost: 95,
      },
    ]);
  });

  it('prices alloc-001 for emp-001 at the official reference values', () => {
    const priced = priceMonthlyAllocation({
      personMonths: allocation.amount,
      weeklyHours: employee.weeklyHours,
      month: allocation.month,
      rates,
    });

    expect(priced.workingDays).toBe(22);
    expect(hoursForPersonMonths(1, employee.weeklyHours, priced.workingDays)).toBe(176);
    expect(priced.allocationHours).toBe(88);
    expect(priced.hoursPerWorkingDay).toBe(4);
    expect(priced.cost).toBe(7880);
    expect(priced.capacity).toBe(0.5);
    expect(formatCapacityPercent(priced.capacity)).toBe('50.0%');
    expect(priced.blendedHourlyRate).toBe(7880 / 88);
    expect(priced.cost / priced.allocationHours).toBe(7880 / 88);
    expect(formatHourlyRate(priced.blendedHourlyRate, 4)).toBe('89.5455');
    expect(priced.splits).toEqual([
      {
        rateId: 'rate-001',
        validFrom: '2025-01-01',
        hourlyCost: 80,
        workingDays: 8,
        hours: 32,
        cost: 2560,
      },
      {
        rateId: 'rate-002',
        validFrom: '2026-03-12',
        hourlyCost: 95,
        workingDays: 14,
        hours: 56,
        cost: 5320,
      },
    ]);
  });
});
