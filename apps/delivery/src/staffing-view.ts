import type {
  Allocation,
  BreakdownItem,
  DisplayCurrency,
  Employee,
  RateRecord,
} from '@baseline/contracts';
import {
  capacityRatioForPersonMonths,
  costForPersonMonths,
  distributeLargestRemainder,
  hoursForPersonMonths,
  monthRateSchedule,
  parseYearMonth,
  personMonthsForCapacityRatio,
  personMonthsForCost,
  personMonthsForHours,
  projectVisibleMonths,
  rollupEffortAndCost,
  type HourlyRate,
  type RateCoverage,
} from '@baseline/delivery-domain';
import { buildWbsTree, type WbsNode } from './wbs-view';

export type StaffingUnit = 'pm' | 'hours' | 'percent' | 'cost';

export const STAFFING_UNITS = ['pm', 'hours', 'percent', 'cost'] as const satisfies readonly StaffingUnit[];

export const NO_EFFECTIVE_RATE_MESSAGE =
  'Cannot enter Cost for this month because no effective rate is available.';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const INVALID_NUMBER_MESSAGE = 'Enter a finite number greater than or equal to 0.';

interface ExactCell {
  personMonths: number;
  hours: number;
  percent: number;
  cost: number;
  coverage: RateCoverage;
}

export interface StaffingDisplayCell {
  employeeId: string;
  month: string;
  personMonths: number;
  hours: number;
  percent: number;
  cost: number;
  coverage: RateCoverage;
  /** Exact value in the selected unit. This is not a display-rounded number. */
  exact: number;
  minor: number;
  text: string;
  coverageLabel: string | null;
}

export interface StaffingDisplayTotal {
  minor: number;
  text: string;
}

export interface StaffingDisplayRow {
  employee: Employee;
  cells: readonly StaffingDisplayCell[];
  total: StaffingDisplayTotal;
}

export interface StaffingColumnTotal extends StaffingDisplayTotal {
  month: string;
}

export interface StaffingGridModel {
  months: readonly string[];
  selectedItemId: string;
  selectedName: string;
  readOnly: boolean;
  rows: readonly StaffingDisplayRow[];
  columnTotals: readonly StaffingColumnTotal[];
  grandTotal: StaffingDisplayTotal;
}

export type StaffingGridResult = { ok: true; grid: StaffingGridModel } | { ok: false; message: string };

export type EditConversion = { ok: true; personMonths: number } | { ok: false; message: string };

export function monthColumnLabel(month: string): string {
  const parsed = parseYearMonth(month);
  const label = MONTH_LABELS[parsed.month - 1];
  if (!label) {
    throw new Error(`Invalid month ${month}`);
  }
  return `${label} ${parsed.year}`;
}

export function firstStaffingItemId(items: readonly BreakdownItem[]): string | null {
  return firstLeafId(buildWbsTree(items));
}

export function isLeafItem(items: readonly BreakdownItem[], itemId: string): boolean {
  return items.some((item) => item.id === itemId) && !items.some((item) => item.parentId === itemId);
}

export function hourlyRatesForEmployee(rates: readonly RateRecord[], employeeId: string): HourlyRate[] {
  return rates
    .filter((rate) => rate.employeeId === employeeId)
    .map((rate) => ({
      id: rate.id,
      validFrom: rate.validFrom,
      hourlyCost: rate.hourlyCost,
    }));
}

export function directPersonMonths(
  allocations: readonly Allocation[],
  breakdownItemId: string,
  employeeId: string,
  month: string,
): number {
  const match = allocations.find(
    (allocation) =>
      allocation.breakdownItemId === breakdownItemId &&
      allocation.employeeId === employeeId &&
      allocation.month === month,
  );
  return match ? match.amount : 0;
}

export function editInputValue(exact: number): string {
  return String(exact);
}

export function personMonthsFromEdit(input: {
  unit: StaffingUnit;
  raw: string;
  month: string;
  weeklyHours: number;
  rates: readonly HourlyRate[];
}): EditConversion {
  const trimmed = input.raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: INVALID_NUMBER_MESSAGE };
  }
  const entered = Number(trimmed);
  if (!Number.isFinite(entered) || entered < 0) {
    return { ok: false, message: INVALID_NUMBER_MESSAGE };
  }
  if (input.unit === 'pm') {
    return { ok: true, personMonths: entered };
  }
  if (input.unit === 'percent') {
    return { ok: true, personMonths: personMonthsForCapacityRatio(entered / 100) };
  }
  const schedule = monthRateSchedule(input.month, input.rates);
  if (input.unit === 'hours') {
    const converted = personMonthsForHours(entered, input.weeklyHours, schedule.workingDays.length);
    if (!converted.ok) {
      return { ok: false, message: 'Cannot convert hours because this month has no working days.' };
    }
    return { ok: true, personMonths: converted.value };
  }
  const converted = personMonthsForCost(entered, {
    month: input.month,
    weeklyHours: input.weeklyHours,
    rates: input.rates,
  });
  if (!converted.ok) {
    if (converted.error.code === 'no-effective-rate' || converted.error.code === 'zero-blended-rate') {
      return { ok: false, message: NO_EFFECTIVE_RATE_MESSAGE };
    }
    return { ok: false, message: 'Cannot convert hours because this month has no working days.' };
  }
  return { ok: true, personMonths: converted.value };
}

/**
 * Places the currency symbol around an already reconciled 2-decimal amount.
 * Intl does not choose the rounded number.
 */
export function formatStaffingCost(reconciledPlain: string, currency: DisplayCurrency): string {
  const negative = reconciledPlain.startsWith('-');
  const unsigned = negative ? reconciledPlain.slice(1) : reconciledPlain;
  const [wholePart, fraction = '00'] = unsigned.split('.');
  const grouped = (wholePart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = `${negative ? '-' : ''}${grouped}.${fraction}`;
  const parts = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(1);
  const symbol = parts.find((part) => part.type === 'currency')?.value ?? currency;
  const currencyIndex = parts.findIndex((part) => part.type === 'currency');
  const integerIndex = parts.findIndex((part) => part.type === 'integer');
  return currencyIndex < integerIndex ? `${symbol}${amount}` : `${amount} ${symbol}`;
}

export function buildStaffingGrid(input: {
  project: { startDate: string; endDate: string };
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
  employees: readonly Employee[];
  rates: readonly RateRecord[];
  selectedItemId: string;
  unit: StaffingUnit;
  currency: DisplayCurrency;
}): StaffingGridResult {
  let months: readonly string[];
  try {
    const visible = projectVisibleMonths(input.project);
    if (!visible.ok) {
      return {
        ok: false,
        message: `The project end date ${visible.error.endDate} is before its start date ${visible.error.startDate}, so staffing months cannot be shown.`,
      };
    }
    months = visible.value;
  } catch {
    return { ok: false, message: 'Staffing months cannot be shown because the project dates are invalid.' };
  }

  const selected = input.items.find((item) => item.id === input.selectedItemId);
  if (!selected) {
    return { ok: false, message: 'The selected work breakdown item is no longer available.' };
  }

  const readOnly = !isLeafItem(input.items, selected.id);
  const exactRows: ExactCell[][] = [];
  for (const employee of input.employees) {
    const row: ExactCell[] = [];
    for (const month of months) {
      const cell = exactCell({
        items: input.items,
        allocations: input.allocations,
        selectedItemId: selected.id,
        readOnly,
        employee,
        month,
        rates: hourlyRatesForEmployee(input.rates, employee.id),
      });
      if (!cell.ok) {
        return cell;
      }
      row.push(cell.value);
    }
    exactRows.push(row);
  }

  const fractionDigits = input.unit === 'percent' ? 1 : 2;
  const exactValues = exactRows.flatMap((row) => row.map((cell) => exactUnitValue(cell, input.unit)));
  const distributed = distributeLargestRemainder(exactValues, fractionDigits);
  const columnMinors = months.map(() => 0);
  let grandMinor = 0;
  const rows: StaffingDisplayRow[] = input.employees.map((employee, employeeIndex) => {
    let rowMinor = 0;
    const cells = months.map((month, monthIndex) => {
      const source = exactRows[employeeIndex]?.[monthIndex];
      const minor = distributed.minorUnits[employeeIndex * months.length + monthIndex] ?? 0;
      if (!source) {
        throw new Error('Missing staffing cell');
      }
      rowMinor += minor;
      columnMinors[monthIndex] = (columnMinors[monthIndex] ?? 0) + minor;
      grandMinor += minor;
      return {
        employeeId: employee.id,
        month,
        personMonths: source.personMonths,
        hours: source.hours,
        percent: source.percent,
        cost: source.cost,
        coverage: source.coverage,
        exact: exactUnitValue(source, input.unit),
        minor,
        text: formatDistributed(minor, input.unit, input.currency),
        coverageLabel: coverageLabel(source.coverage, source.personMonths, input.unit),
      };
    });
    return {
      employee,
      cells,
      total: {
        minor: rowMinor,
        text: formatDistributed(rowMinor, input.unit, input.currency),
      },
    };
  });

  return {
    ok: true,
    grid: {
      months,
      selectedItemId: selected.id,
      selectedName: selected.name,
      readOnly,
      rows,
      columnTotals: months.map((month, index) => ({
        month,
        minor: columnMinors[index] ?? 0,
        text: formatDistributed(columnMinors[index] ?? 0, input.unit, input.currency),
      })),
      grandTotal: {
        minor: grandMinor,
        text: formatDistributed(grandMinor, input.unit, input.currency),
      },
    },
  };
}

function firstLeafId(nodes: readonly WbsNode[]): string | null {
  for (const node of nodes) {
    if (node.children.length === 0) {
      return node.item.id;
    }
    const nested = firstLeafId(node.children);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

function exactCell(input: {
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
  selectedItemId: string;
  readOnly: boolean;
  employee: Employee;
  month: string;
  rates: readonly HourlyRate[];
}): { ok: true; value: ExactCell } | { ok: false; message: string } {
  const schedule = monthRateSchedule(input.month, input.rates);
  const conversion = {
    month: input.month,
    weeklyHours: input.employee.weeklyHours,
    rates: input.rates,
  };
  if (!input.readOnly) {
    const personMonths = directPersonMonths(
      input.allocations,
      input.selectedItemId,
      input.employee.id,
      input.month,
    );
    const priced = costForPersonMonths(personMonths, conversion);
    return {
      ok: true,
      value: measure(personMonths, priced.cost, priced.coverage, input.employee.weeklyHours, schedule.workingDays.length),
    };
  }

  const leaves = new Set(
    input.items.filter((item) => isLeafItem(input.items, item.id)).map((item) => item.id),
  );
  const contributions = [];
  for (const allocation of input.allocations) {
    if (allocation.employeeId !== input.employee.id || allocation.month !== input.month) {
      continue;
    }
    if (!leaves.has(allocation.breakdownItemId)) {
      continue;
    }
    const priced = costForPersonMonths(allocation.amount, conversion);
    contributions.push({
      itemId: allocation.breakdownItemId,
      personMonths: allocation.amount,
      cost: priced.cost,
    });
  }
  const rolled = rollupEffortAndCost(input.items, contributions);
  if (!rolled.ok) {
    return {
      ok: false,
      message: 'Staffing values cannot be derived because the work breakdown structure is invalid.',
    };
  }
  const effort = rolled.value.get(input.selectedItemId) ?? { personMonths: 0, cost: 0 };
  return {
    ok: true,
    value: measure(effort.personMonths, effort.cost, schedule.coverage, input.employee.weeklyHours, schedule.workingDays.length),
  };
}

function measure(
  personMonths: number,
  cost: number,
  coverage: RateCoverage,
  weeklyHours: number,
  workingDays: number,
): ExactCell {
  return {
    personMonths,
    hours: hoursForPersonMonths(personMonths, weeklyHours, workingDays),
    percent: capacityRatioForPersonMonths(personMonths) * 100,
    cost,
    coverage,
  };
}

function exactUnitValue(cell: ExactCell, unit: StaffingUnit): number {
  switch (unit) {
    case 'pm':
      return cell.personMonths;
    case 'hours':
      return cell.hours;
    case 'percent':
      return cell.percent;
    case 'cost':
      return cell.cost;
    default:
      return assertNever(unit);
  }
}

function coverageLabel(coverage: RateCoverage, personMonths: number, unit: StaffingUnit): string | null {
  if (unit !== 'cost' || !(personMonths > 0)) {
    return null;
  }
  if (coverage.status === 'partial') {
    return 'Partial rate';
  }
  if (coverage.status === 'none') {
    return 'No rate';
  }
  return null;
}

function formatDistributed(minor: number, unit: StaffingUnit, currency: DisplayCurrency): string {
  const digits = unit === 'percent' ? 1 : 2;
  const plain = formatMinor(minor, digits);
  if (unit === 'percent') {
    return `${plain}%`;
  }
  if (unit === 'cost') {
    return formatStaffingCost(plain, currency);
  }
  return plain;
}

function formatMinor(minor: number, digits: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const scale = 10 ** digits;
  const whole = Math.floor(absolute / scale);
  const fraction = String(absolute % scale).padStart(digits, '0');
  const text = `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled staffing unit: ${JSON.stringify(value)}`);
}
