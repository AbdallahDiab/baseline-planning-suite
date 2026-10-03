import { monthRateSchedule, priceMonthlyAllocation } from './pricing';
import type { HourlyRate, RateCoverage } from './pricing';
import { err, ok } from './result';
import type { DomainResult } from './result';

export interface MonthConversionInput {
  month: string;
  weeklyHours: number;
  rates: readonly HourlyRate[];
}

export type UnitConversionError =
  | { code: 'zero-hours-per-person-month' }
  | {
      code: 'no-effective-rate';
      month: string;
      coverage: RateCoverage;
    }
  | {
      code: 'zero-blended-rate';
      month: string;
      coverage: RateCoverage;
    };

/**
 * Hours in one person-month for a calendar month.
 * `weeklyHours * workingDays / 5`. This value is not rounded.
 */
export function hoursPerPersonMonth(weeklyHours: number, workingDays: number): number {
  return (weeklyHours * workingDays) / 5;
}

/**
 * Hours back to the canonical person-month. The result is not display-rounded.
 */
export function personMonthsForHours(
  hours: number,
  weeklyHours: number,
  workingDays: number,
): DomainResult<number, UnitConversionError> {
  const perPersonMonth = hoursPerPersonMonth(weeklyHours, workingDays);
  if (!(perPersonMonth > 0)) {
    return err({ code: 'zero-hours-per-person-month' });
  }
  return ok(hours / perPersonMonth);
}

/**
 * 100% monthly capacity is exactly 1 person-month.
 * The returned ratio is the canonical amount, not a rounded percent.
 */
export function capacityRatioForPersonMonths(personMonths: number): number {
  return personMonths;
}

/** Inverse of {@link capacityRatioForPersonMonths}. Does not round. */
export function personMonthsForCapacityRatio(capacityRatio: number): number {
  return capacityRatio;
}

export interface PricedPersonMonths {
  cost: number;
  coverage: RateCoverage;
  /**
   * Exact blended hourly rate for this person-month amount.
   * Null when coverage is `none` or the rate is not strictly positive.
   */
  exactBlendedHourlyRate: number | null;
}

/**
 * Cost of a canonical person-month amount.
 * Months with no effective rate cost 0 and report coverage `none`.
 */
export function costForPersonMonths(
  personMonths: number,
  input: MonthConversionInput,
): PricedPersonMonths {
  const priced = priceMonthlyAllocation({
    personMonths,
    weeklyHours: input.weeklyHours,
    month: input.month,
    rates: input.rates,
  });
  const schedule = monthRateSchedule(input.month, input.rates);
  return {
    cost: priced.cost,
    coverage: priced.coverage,
    exactBlendedHourlyRate:
      usableBlendedRate(priced.blendedHourlyRate, priced.coverage) ?? schedule.exactBlendedHourlyRate,
  };
}

/**
 * Entered cost back to the canonical person-month.
 * 1. Take the exact blended hourly rate from a 1 person-month pricing of the month.
 * 2. Convert the entered cost to hours with that rate.
 * 3. Convert those hours to person-months.
 * A displayed rate such as 89.5455 is not an input.
 * Fails when the month has no usable blended rate.
 */
export function personMonthsForCost(
  cost: number,
  input: MonthConversionInput,
): DomainResult<number, UnitConversionError> {
  const reference = costForPersonMonths(1, input);
  if (reference.coverage.status === 'none' || reference.exactBlendedHourlyRate === null) {
    if (reference.coverage.status === 'none') {
      return err({
        code: 'no-effective-rate',
        month: input.month,
        coverage: reference.coverage,
      });
    }
    return err({
      code: 'zero-blended-rate',
      month: input.month,
      coverage: reference.coverage,
    });
  }
  const schedule = monthRateSchedule(input.month, input.rates);
  const hours = cost / reference.exactBlendedHourlyRate;
  return personMonthsForHours(hours, input.weeklyHours, schedule.workingDays.length);
}

function usableBlendedRate(blendedHourlyRate: number, coverage: RateCoverage): number | null {
  if (coverage.status === 'none' || !(blendedHourlyRate > 0)) {
    return null;
  }
  return blendedHourlyRate;
}
