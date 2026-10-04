import type { Allocation, BreakdownItem, Employee, RateRecord } from '@baseline/contracts';
import { describe, expect, it } from 'vitest';
import { personMonthsForHours } from '@baseline/delivery-domain';
import {
  NO_EFFECTIVE_RATE_MESSAGE,
  buildStaffingGrid,
  directPersonMonths,
  editInputValue,
  firstStaffingItemId,
  personMonthsFromEdit,
  type StaffingUnit,
} from './staffing-view';

const ledger = {
  startDate: '2026-03-01',
  endDate: '2027-02-28',
};

const march = {
  startDate: '2026-03-01',
  endDate: '2026-03-31',
};

const items: BreakdownItem[] = [
  { id: 'wbs-root', projectId: 'prj-1', parentId: null, name: 'Ledger migration' },
  { id: 'wbs-other', projectId: 'prj-1', parentId: null, name: 'Reporting cut-over' },
  { id: 'wbs-child', projectId: 'prj-1', parentId: 'wbs-root', name: 'Discovery' },
  { id: 'wbs-allocated', projectId: 'prj-1', parentId: 'wbs-root', name: 'Pilot' },
  { id: 'wbs-leaf', projectId: 'prj-1', parentId: 'wbs-child', name: 'Design' },
];

const ada: Employee = { id: 'emp-001', name: 'Ada', role: 'Engineer', weeklyHours: 40 };

const goldenRates: RateRecord[] = [
  { id: 'rate-001', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 80 },
  { id: 'rate-002', employeeId: 'emp-001', validFrom: '2026-03-12', hourlyCost: 95 },
  { id: 'rate-other', employeeId: 'emp-999', validFrom: '2025-01-01', hourlyCost: 10 },
];

function allocation(amount: number, itemId = 'wbs-leaf', month = '2026-03', employeeId = ada.id): Allocation {
  return {
    id: `alloc-${itemId}-${employeeId}-${month}`,
    breakdownItemId: itemId,
    employeeId,
    month,
    amount,
    updatedAt: null,
  };
}

function gridFor(input: {
  unit?: StaffingUnit;
  amount?: number;
  rates?: RateRecord[];
  allocations?: Allocation[];
  employees?: Employee[];
  selectedItemId?: string;
  project?: { startDate: string; endDate: string };
  wbs?: BreakdownItem[];
}) {
  const result = buildStaffingGrid({
    project: input.project ?? march,
    items: input.wbs ?? [{ id: 'wbs-leaf', projectId: 'prj-1', parentId: null, name: 'Design' }],
    allocations: input.allocations ?? [allocation(input.amount ?? 0.5)],
    employees: input.employees ?? [ada],
    rates: input.rates ?? goldenRates,
    selectedItemId: input.selectedItemId ?? 'wbs-leaf',
    unit: input.unit ?? 'pm',
    currency: 'EUR',
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.grid;
}

describe('staffing view model', () => {
  it('derives project-visible months from project dates', () => {
    const grid = gridFor({ project: ledger, wbs: items, allocations: [], employees: [ada] });

    expect(grid.months[0]).toBe('2026-03');
    expect(grid.months).toContain('2026-03');
    expect(grid.months).toHaveLength(12);
    expect(grid.months.at(-1)).toBe('2027-02');
  });

  it('explains an invalid project month range', () => {
    const result = buildStaffingGrid({
      project: { startDate: '2026-04-01', endDate: '2026-03-01' },
      items: [{ id: 'wbs-leaf', projectId: 'prj-1', parentId: null, name: 'Design' }],
      allocations: [],
      employees: [ada],
      rates: [],
      selectedItemId: 'wbs-leaf',
      unit: 'pm',
      currency: 'EUR',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('before its start date');
    }
  });

  it('selects the first leaf in tree order', () => {
    expect(firstStaffingItemId(items)).toBe('wbs-leaf');
  });

  it('reads direct leaf person-months and treats a missing cell as zero', () => {
    const allocations = [allocation(0.5), allocation(0, 'wbs-leaf', '2026-04')];

    expect(directPersonMonths(allocations, 'wbs-leaf', ada.id, '2026-03')).toBe(0.5);
    expect(directPersonMonths(allocations, 'wbs-leaf', ada.id, '2026-04')).toBe(0);
    expect(directPersonMonths(allocations, 'wbs-leaf', ada.id, '2026-05')).toBe(0);
    expect(gridFor({ allocations, project: ledger, wbs: items }).rows[0]?.cells[0]?.personMonths).toBe(0.5);
    expect(gridFor({ allocations, project: ledger, wbs: items }).rows[0]?.cells[1]?.personMonths).toBe(0);
  });

  it('converts canonical person-months to hours, percent, and mid-month cost', () => {
    const hours = gridFor({ unit: 'hours' });
    const percent = gridFor({ unit: 'percent' });
    const cost = gridFor({ unit: 'cost' });
    const cell = cost.rows[0]?.cells[0];

    expect(hours.rows[0]?.cells[0]?.hours).toBe(88);
    expect(hours.rows[0]?.cells[0]?.text).toBe('88.00');
    expect(percent.rows[0]?.cells[0]?.percent).toBe(50);
    expect(percent.rows[0]?.cells[0]?.text).toBe('50.0%');
    expect(cell?.cost).toBe(7880);
    expect(cell?.text).toBe('€7,880.00');
  });

  it('preserves the official golden reference at the view boundary', () => {
    const cell = gridFor({ unit: 'cost' }).rows[0]?.cells[0];
    if (!cell) {
      throw new Error('Missing golden cell');
    }

    expect(gridFor({ unit: 'pm' }).rows[0]?.cells[0]?.text).toBe('0.50');
    expect(cell.personMonths).toBe(0.5);
    expect(cell.hours).toBe(88);
    expect(cell.percent).toBe(50);
    expect(cell.cost).toBe(7880);
    expect(cell.cost / cell.hours).toBe(7880 / 88);
    expect(cell.text).toBe('€7,880.00');
    expect(cell.coverage).toEqual({ status: 'full' });
  });

  it('converts hours, percent, and exact blended cost back to canonical person-months', () => {
    const rates = goldenRates
      .filter((rate) => rate.employeeId === ada.id)
      .map((rate) => ({ id: rate.id, validFrom: rate.validFrom, hourlyCost: rate.hourlyCost }));
    const shared = { month: '2026-03', weeklyHours: 40 as const, rates };

    const hours = personMonthsFromEdit({ unit: 'hours', raw: '88', ...shared });
    const percent = personMonthsFromEdit({ unit: 'percent', raw: '50', ...shared });
    const over = personMonthsFromEdit({ unit: 'percent', raw: '125', ...shared });
    const cost = personMonthsFromEdit({ unit: 'cost', raw: '7880', ...shared });
    const unchanged = personMonthsFromEdit({ unit: 'pm', raw: String(1 / 3), ...shared });

    expect(hours).toEqual({ ok: true, personMonths: 0.5 });
    expect(percent).toEqual({ ok: true, personMonths: 0.5 });
    expect(over).toEqual({ ok: true, personMonths: 1.25 });
    expect(cost).toEqual({ ok: true, personMonths: 0.5 });
    expect(unchanged).toEqual({ ok: true, personMonths: 1 / 3 });

    const roundedRateHours = 7880 / 89.5455;
    const fromRoundedRate = personMonthsForHours(roundedRateHours, 40, 22);
    expect(fromRoundedRate.ok && fromRoundedRate.value).not.toBe(0.5);
  });

  it('rejects cost input when no effective rate is available', () => {
    const result = personMonthsFromEdit({
      unit: 'cost',
      raw: '100',
      month: '2026-03',
      weeklyHours: 40,
      rates: [],
    });

    expect(result).toEqual({ ok: false, message: NO_EFFECTIVE_RATE_MESSAGE });
  });

  it('preserves partial and missing rate coverage', () => {
    const partial = gridFor({
      unit: 'cost',
      rates: [{ id: 'mid', employeeId: ada.id, validFrom: '2026-03-16', hourlyCost: 100 }],
    }).rows[0]?.cells[0];
    const missing = gridFor({ unit: 'cost', rates: [] }).rows[0]?.cells[0];
    const idle = gridFor({ unit: 'cost', amount: 0, rates: [] }).rows[0]?.cells[0];

    expect(partial?.coverage.status).toBe('partial');
    expect(partial?.cost).toBeGreaterThan(0);
    expect(partial?.coverageLabel).toBe('Partial rate');
    expect(partial?.text).not.toBe('€0.00');
    expect(missing?.coverage.status).toBe('none');
    expect(missing?.cost).toBe(0);
    expect(missing?.text).toBe('€0.00');
    expect(missing?.coverageLabel).toBe('No rate');
    expect(idle?.coverageLabel).toBeNull();
  });

  it('derives parent person-months and cost from descendant leaves', () => {
    const parent = gridFor({
      project: march,
      wbs: items,
      selectedItemId: 'wbs-root',
      allocations: [allocation(0.25, 'wbs-leaf'), allocation(0.25, 'wbs-allocated')],
      rates: [{ id: 'flat', employeeId: ada.id, validFrom: '2025-01-01', hourlyCost: 100 }],
      unit: 'cost',
    });
    const cell = parent.rows[0]?.cells[0];

    expect(parent.readOnly).toBe(true);
    expect(cell?.personMonths).toBe(0.5);
    expect(cell?.cost).toBe(8800);
    expect(cell?.hours).toBe(88);
    expect(cell?.percent).toBe(50);
  });

  it('reconciles displayed cells with row, column, and grand totals', () => {
    const employees: Employee[] = [
      { id: 'e1', name: 'One', role: 'Engineer', weeklyHours: 40 },
      { id: 'e2', name: 'Two', role: 'Engineer', weeklyHours: 40 },
      { id: 'e3', name: 'Three', role: 'Engineer', weeklyHours: 40 },
    ];
    const grid = gridFor({
      employees,
      allocations: employees.map((employee) => allocation(1.004, 'wbs-leaf', '2026-03', employee.id)),
      rates: [],
      unit: 'pm',
    });
    const detailMinors = grid.rows.flatMap((row) => row.cells.map((cell) => cell.minor));
    const rowMinors = grid.rows.map((row) => row.total.minor);
    const columnMinors = grid.columnTotals.map((column) => column.minor);

    expect(grid.rows.map((row) => row.cells[0]?.text)).toEqual(['1.01', '1.00', '1.00']);
    expect(detailMinors).toEqual([101, 100, 100]);
    expect(rowMinors).toEqual([101, 100, 100]);
    expect(columnMinors).toEqual([301]);
    expect(grid.grandTotal.minor).toBe(301);
    expect(grid.grandTotal.text).toBe('3.01');
    expect(detailMinors.reduce((sum, minor) => sum + minor, 0)).toBe(grid.grandTotal.minor);
    expect(rowMinors.reduce((sum, minor) => sum + minor, 0)).toBe(grid.grandTotal.minor);
    expect(columnMinors.reduce((sum, minor) => sum + minor, 0)).toBe(grid.grandTotal.minor);
    expect(grid.rows[0]?.cells[0]?.personMonths).toBe(1.004);
  });

  it('does not use a display-rounded value as canonical person-months', () => {
    const exact = 1 / 3;
    const cell = gridFor({ amount: exact, unit: 'pm' }).rows[0]?.cells[0];
    if (!cell) {
      throw new Error('Missing cell');
    }
    const seed = editInputValue(cell.exact);
    const fromSeed = personMonthsFromEdit({
      unit: 'pm',
      raw: seed,
      month: '2026-03',
      weeklyHours: 40,
      rates: [],
    });
    const fromDisplay = personMonthsFromEdit({
      unit: 'pm',
      raw: cell.text,
      month: '2026-03',
      weeklyHours: 40,
      rates: [],
    });

    expect(cell.text).toBe('0.33');
    expect(cell.personMonths).toBe(exact);
    expect(seed).toBe(String(exact));
    expect(seed).not.toBe(cell.text);
    expect(fromSeed).toEqual({ ok: true, personMonths: exact });
    expect(fromDisplay).toEqual({ ok: true, personMonths: 0.33 });
    expect(fromDisplay.ok && fromDisplay.personMonths).not.toBe(exact);
  });
});
