import { compareIsoDate, listWorkingDays, parseIsoDate, parseYearMonth } from './dates';

export interface HourlyRate {
  id: string;
  validFrom: string;
  hourlyCost: number;
}

export interface MonthlyAllocationInput {
  personMonths: number;
  weeklyHours: number;
  /** Calendar month, `YYYY-MM`. */
  month: string;
  rates: readonly HourlyRate[];
}

export interface RateWorkingDaySplit {
  rateId: string;
  validFrom: string;
  hourlyCost: number;
  workingDays: number;
  hours: number;
  cost: number;
}

/**
 * How much of an allocation month is covered by an effective hourly rate.
 * Missing days are listed so a future UI can mark them. No rate is invented.
 */
export type RateCoverage =
  | { status: 'full' }
  | {
      status: 'partial';
      missingWorkingDays: number;
      unpricedWorkingDays: readonly string[];
    }
  | {
      status: 'none';
      missingWorkingDays: number;
      unpricedWorkingDays: readonly string[];
    };

export interface MonthRateSchedule {
  month: string;
  workingDays: readonly string[];
  coverage: RateCoverage;
  /**
   * Exact average hourly cost across every working day in the month.
   * Unpriced days contribute zero, so the average does not depend on a
   * person-month amount. Null when the average is not a usable rate.
   */
  exactBlendedHourlyRate: number | null;
}

export interface MonthlyAllocationPrice {
  workingDays: number;
  allocationHours: number;
  hoursPerWorkingDay: number;
  cost: number;
  /**
   * Canonical capacity. The stored allocation unit is the person-month,
   * and 1 person-month is 100% of the month.
   */
  capacity: number;
  /**
   * Exact `cost / allocationHours` when the allocation has hours, otherwise 0.
   * Four-decimal display rounding is not part of this value.
   * A 0 result is not a usable rate when coverage is `none`.
   */
  blendedHourlyRate: number;
  coverage: RateCoverage;
  splits: readonly RateWorkingDaySplit[];
}

/**
 * Canonical person-month conversion.
 * `hours = personMonths * weeklyHours * workingDays / 5`.
 */
export function hoursForPersonMonths(
  personMonths: number,
  weeklyHours: number,
  workingDays: number,
): number {
  return (personMonths * weeklyHours * workingDays) / 5;
}

/**
 * Latest rate whose `validFrom` is on or before `day`.
 * Equal dates break ties by the greater rate id. Returns null when every
 * rate starts after the day. Malformed dates still throw.
 */
function selectRate(rates: readonly HourlyRate[], day: string): HourlyRate | null {
  let selected: HourlyRate | null = null;
  for (const rate of rates) {
    parseIsoDate(rate.validFrom);
    if (compareIsoDate(rate.validFrom, day) > 0) {
      continue;
    }
    if (
      !selected ||
      compareIsoDate(selected.validFrom, rate.validFrom) < 0 ||
      (compareIsoDate(selected.validFrom, rate.validFrom) === 0 && rate.id > selected.id)
    ) {
      selected = rate;
    }
  }
  return selected;
}

function coverageFor(workingDayCount: number, unpricedWorkingDays: readonly string[]): RateCoverage {
  if (unpricedWorkingDays.length === 0) {
    return { status: 'full' };
  }
  const missing = {
    missingWorkingDays: unpricedWorkingDays.length,
    unpricedWorkingDays,
  };
  if (workingDayCount === 0 || unpricedWorkingDays.length === workingDayCount) {
    return { status: 'none', ...missing };
  }
  return { status: 'partial', ...missing };
}

export function monthRateSchedule(
  month: string,
  rates: readonly HourlyRate[],
): MonthRateSchedule {
  const { year, month: monthNumber } = parseYearMonth(month);
  const workingDays = listWorkingDays(year, monthNumber);
  const unpricedWorkingDays: string[] = [];
  let weightedHourlyCost = 0;
  for (const day of workingDays) {
    const rate = selectRate(rates, day);
    if (!rate) {
      unpricedWorkingDays.push(day);
      continue;
    }
    weightedHourlyCost += rate.hourlyCost;
  }
  const coverage = coverageFor(workingDays.length, unpricedWorkingDays);
  const average = workingDays.length === 0 ? 0 : weightedHourlyCost / workingDays.length;
  return {
    month,
    workingDays,
    coverage,
    exactBlendedHourlyRate: average > 0 ? average : null,
  };
}

export function priceMonthlyAllocation(input: MonthlyAllocationInput): MonthlyAllocationPrice {
  const { year, month } = parseYearMonth(input.month);
  const workingDayList = listWorkingDays(year, month);
  const workingDays = workingDayList.length;
  const allocationHours = hoursForPersonMonths(
    input.personMonths,
    input.weeklyHours,
    workingDays,
  );
  const hoursPerWorkingDay = workingDays === 0 ? 0 : allocationHours / workingDays;
  const unpricedWorkingDays: string[] = [];

  const grouped: Array<Omit<RateWorkingDaySplit, 'hours' | 'cost'>> = [];
  for (const day of workingDayList) {
    const rate = selectRate(input.rates, day);
    if (!rate) {
      unpricedWorkingDays.push(day);
      continue;
    }
    const current = grouped[grouped.length - 1];
    if (current && current.rateId === rate.id) {
      current.workingDays += 1;
      continue;
    }
    grouped.push({
      rateId: rate.id,
      validFrom: rate.validFrom,
      hourlyCost: rate.hourlyCost,
      workingDays: 1,
    });
  }

  let cost = 0;
  const splits = grouped.map((group) => {
    const hours = hoursPerWorkingDay * group.workingDays;
    const sliceCost = hours * group.hourlyCost;
    cost += sliceCost;
    return {
      ...group,
      hours,
      cost: sliceCost,
    };
  });

  return {
    workingDays,
    allocationHours,
    hoursPerWorkingDay,
    cost,
    capacity: input.personMonths,
    blendedHourlyRate: allocationHours === 0 ? 0 : cost / allocationHours,
    coverage: coverageFor(workingDays, unpricedWorkingDays),
    splits,
  };
}
