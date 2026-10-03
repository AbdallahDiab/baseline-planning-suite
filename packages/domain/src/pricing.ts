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
   * Exact `cost / allocationHours`.
   * Four-decimal display rounding is not part of this value.
   */
  blendedHourlyRate: number;
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

function selectRate(rates: readonly HourlyRate[], day: string): HourlyRate {
  const applicable = rates.filter((rate) => {
    parseIsoDate(rate.validFrom);
    return compareIsoDate(rate.validFrom, day) <= 0;
  });
  if (applicable.length === 0) {
    throw new Error(`No hourly rate is valid on ${day}`);
  }
  applicable.sort((left, right) => {
    const byDate = compareIsoDate(left.validFrom, right.validFrom);
    if (byDate !== 0) {
      return byDate;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
  const selected = applicable[applicable.length - 1];
  if (!selected) {
    throw new Error(`No hourly rate is valid on ${day}`);
  }
  return selected;
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

  const grouped: Array<Omit<RateWorkingDaySplit, 'hours' | 'cost'>> = [];
  for (const day of workingDayList) {
    const rate = selectRate(input.rates, day);
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
    splits,
  };
}
