import { describe, expect, it } from 'vitest';
import { compareInstant, isOversubscribed, summarizeEmployeeCapacity } from './index';
import type { DomainAllocation } from './index';

function allocation(overrides: Partial<DomainAllocation> & Pick<DomainAllocation, 'id' | 'personMonths'>): DomainAllocation {
  return {
    breakdownItemId: 'wbs-leaf',
    employeeId: 'emp-023',
    month: '2026-06',
    updatedAt: null,
    ...overrides,
  };
}

describe('cross-project capacity', () => {
  it('compares edited timestamps as instants, including offsets and fractional seconds', () => {
    expect(compareInstant('1970-01-01T00:00:00Z', '1970-01-01T00:00:00.000Z')).toBe(0);
    expect(compareInstant('2026-06-15T14:00:00+02:00', '2026-06-15T12:00:00Z')).toBe(0);
    expect(compareInstant('2026-06-15T12:00:00Z', '2026-06-15T12:00:00.100Z')).toBe(-1);
  });

  it('marks exactly 1 person-month as fully used and not oversubscribed', () => {
    expect(isOversubscribed(1)).toBe(false);
    expect(isOversubscribed(1.3)).toBe(true);
    const [summary] = summarizeEmployeeCapacity([
      allocation({ id: 'later-in-array', personMonths: 0.4, updatedAt: '2026-06-02T00:00:00Z' }),
      allocation({ id: 'earlier-in-array', personMonths: 0.6, updatedAt: '2026-06-20T00:00:00Z' }),
    ]);
    expect(summary).toMatchObject({
      personMonths: 1,
      oversubscribed: false,
      cause: null,
    });
  });

  it('does not name a cause when every contributing allocation is unedited', () => {
    const [summary] = summarizeEmployeeCapacity([
      allocation({ id: 'alloc-054', personMonths: 0.65, breakdownItemId: 'wbs-prj-1' }),
      allocation({ id: 'alloc-101', personMonths: 0.65, breakdownItemId: 'wbs-prj-4' }),
    ]);
    expect(summary).toEqual({
      employeeId: 'emp-023',
      month: '2026-06',
      personMonths: 1.3,
      oversubscribed: true,
      cause: null,
    });
  });

  it('selects the latest edited allocation across projects, not array order', () => {
    const summaries = summarizeEmployeeCapacity([
      allocation({
        id: 'zzz-first',
        employeeId: 'emp-003',
        personMonths: 0.59,
        breakdownItemId: 'wbs-prj-1',
        updatedAt: '2026-06-18T09:00:00Z',
      }),
      allocation({
        id: 'middle-edit',
        employeeId: 'emp-003',
        personMonths: 0.59,
        breakdownItemId: 'wbs-prj-3',
        updatedAt: '2026-06-18T13:30:00+01:00',
      }),
      allocation({
        id: 'last-in-array',
        employeeId: 'emp-003',
        personMonths: 0.1,
        updatedAt: '2026-06-18T08:00:00Z',
      }),
    ]);
    expect(summaries).toEqual([
      {
        employeeId: 'emp-003',
        month: '2026-06',
        personMonths: 1.28,
        oversubscribed: true,
        cause: { allocationId: 'middle-edit', updatedAt: '2026-06-18T13:30:00+01:00' },
      },
    ]);
  });

  it('breaks equal edit timestamps by the greater allocation id', () => {
    const [summary] = summarizeEmployeeCapacity([
      allocation({
        id: 'alloc-a',
        personMonths: 0.7,
        updatedAt: '2026-06-01T00:00:00Z',
      }),
      allocation({
        id: 'alloc-b',
        personMonths: 0.7,
        updatedAt: '2026-06-01T00:00:00.000Z',
      }),
    ]);
    expect(summary?.oversubscribed).toBe(true);
    expect(summary?.cause).toEqual({
      allocationId: 'alloc-b',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
  });
});
