import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DomainAllocation } from '../allocation';
import type { WbsItem } from '../wbs';

export interface SeedEmployee {
  id: string;
  weeklyHours: number;
}

export interface SeedRate {
  id: string;
  employeeId: string;
  validFrom: string;
  hourlyCost: number;
}

export interface SeedProject {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface BaselineSeed {
  gridHorizon: { from: string; to: string };
  employees: SeedEmployee[];
  rateRecords: SeedRate[];
  projects: SeedProject[];
  breakdownItems: WbsItem[];
  /** Seed rows have no updatedAt. Domain allocations carry null. */
  allocations: DomainAllocation[];
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

let cached: BaselineSeed | undefined;

export function loadBaselineSeed(): BaselineSeed {
  if (cached) {
    return cached;
  }
  const fixturePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/baseline-seed.json',
  );
  const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('Fixture root is not an object');
  }
  const meta = parsed.meta;
  if (!isRecord(meta) || !isRecord(meta.gridHorizon)) {
    throw new Error('Fixture meta.gridHorizon is missing');
  }

  const employees = readArray(parsed.employees, 'employees').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Employee entry is not an object');
    }
    return { id: readString(entry, 'id'), weeklyHours: readNumber(entry, 'weeklyHours') };
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

  const projects = readArray(parsed.projects, 'projects').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Project entry is not an object');
    }
    return {
      id: readString(entry, 'id'),
      name: readString(entry, 'name'),
      startDate: readString(entry, 'startDate'),
      endDate: readString(entry, 'endDate'),
    };
  });

  const breakdownItems = readArray(parsed.breakdownItems, 'breakdownItems').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Breakdown entry is not an object');
    }
    const parentId = entry.parentId;
    if (parentId !== null && typeof parentId !== 'string') {
      throw new Error('Breakdown parentId is not a string or null');
    }
    return {
      id: readString(entry, 'id'),
      projectId: readString(entry, 'projectId'),
      parentId,
      name: readString(entry, 'name'),
    };
  });

  const allocations = readArray(parsed.allocations, 'allocations').map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('Allocation entry is not an object');
    }
    if ('updatedAt' in entry) {
      throw new Error(`Seed allocation ${readString(entry, 'id')} unexpectedly includes updatedAt`);
    }
    return {
      id: readString(entry, 'id'),
      breakdownItemId: readString(entry, 'breakdownItemId'),
      employeeId: readString(entry, 'employeeId'),
      month: readString(entry, 'month'),
      personMonths: readNumber(entry, 'amount'),
      updatedAt: null,
    };
  });

  cached = {
    gridHorizon: {
      from: readString(meta.gridHorizon, 'from'),
      to: readString(meta.gridHorizon, 'to'),
    },
    employees,
    rateRecords,
    projects,
    breakdownItems,
    allocations,
  };
  return cached;
}
