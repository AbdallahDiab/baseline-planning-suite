import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  capacityRatioForPersonMonths,
  costForPersonMonths,
  hoursForPersonMonths,
  hoursPerPersonMonth,
  personMonthsForCapacityRatio,
  personMonthsForCost,
  personMonthsForHours,
  priceMonthlyAllocation,
} from './index';
import type { HourlyRate } from './index';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/baseline-seed.json',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function officialMarchRates(): HourlyRate[] {
  const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (!isRecord(parsed) || !Array.isArray(parsed.rateRecords)) {
    throw new Error('Fixture is missing rateRecords');
  }
  return parsed.rateRecords.flatMap((entry) => {
    if (!isRecord(entry) || entry.employeeId !== 'emp-001') {
      return [];
    }
    if (typeof entry.id !== 'string' || typeof entry.validFrom !== 'string') {
      throw new Error('Official rate identity is not a string');
    }
    if (typeof entry.hourlyCost !== 'number') {
      throw new Error('Official rate cost is not a number');
    }
    return [{ id: entry.id, validFrom: entry.validFrom, hourlyCost: entry.hourlyCost }];
  });
}

const marchRates = officialMarchRates();
const marchInput = {
  month: '2026-03',
  weeklyHours: 40,
  rates: marchRates,
};

describe('canonical allocation conversions', () => {
  it('converts person-months and hours without rounding the canonical amount', () => {
    expect(hoursPerPersonMonth(40, 22)).toBe(176);
    expect(hoursForPersonMonths(0.5, 40, 22)).toBe(88);
    expect(hoursForPersonMonths(1 / 3, 40, 22)).toBe(176 / 3);

    const back = personMonthsForHours(176 / 3, 40, 22);
    expect(back).toEqual({ ok: true, value: 1 / 3 });
    if (back.ok) {
      expect(back.value).not.toBe(Number((1 / 3).toFixed(2)));
    }
    expect(personMonthsForHours(10, 0, 22)).toEqual({
      ok: false,
      error: { code: 'zero-hours-per-person-month' },
    });
  });

  it('treats 100% capacity as exactly 1 person-month', () => {
    expect(capacityRatioForPersonMonths(0.5)).toBe(0.5);
    expect(capacityRatioForPersonMonths(1)).toBe(1);
    expect(personMonthsForCapacityRatio(1)).toBe(1);
    expect(personMonthsForCapacityRatio(capacityRatioForPersonMonths(1 / 3))).toBe(1 / 3);
  });

  it('converts the official March cost with the exact blended rate, not 89.5455', () => {
    const priced = priceMonthlyAllocation({
      personMonths: 0.5,
      weeklyHours: 40,
      month: '2026-03',
      rates: marchRates,
    });
    expect(priced.cost).toBe(7880);
    expect(priced.blendedHourlyRate).toBe(7880 / 88);

    const forward = costForPersonMonths(0.5, marchInput);
    expect(forward.cost).toBe(7880);
    expect(forward.coverage).toEqual({ status: 'full' });
    expect(forward.exactBlendedHourlyRate).toBe(7880 / 88);
    expect(forward.exactBlendedHourlyRate).not.toBe(89.5455);
    expect(costForPersonMonths(0, marchInput).exactBlendedHourlyRate).toBe(7880 / 88);

    const canonical = personMonthsForCost(7880, marchInput);
    expect(canonical).toEqual({ ok: true, value: 0.5 });

    const displayedHours = 7880 / 89.5455;
    const displayedPersonMonths = displayedHours / 176;
    expect(displayedPersonMonths).not.toBe(0.5);
  });

  it('round-trips a partial month through the exact blended rate', () => {
    const input = {
      month: '2026-03',
      weeklyHours: 40,
      rates: [{ id: 'mid', validFrom: '2026-03-16', hourlyCost: 100 }],
    };
    const forward = costForPersonMonths(0.5, input);
    expect(forward.coverage.status).toBe('partial');
    expect(forward.cost).toBe(4800);
    expect(forward.exactBlendedHourlyRate).toBe(4800 / 88);

    const canonical = personMonthsForCost(forward.cost, input);
    expect(canonical).toEqual({ ok: true, value: 0.5 });
  });

  it('keeps an unrounded person-month when converting cost', () => {
    const input = {
      month: '2026-03',
      weeklyHours: 40,
      rates: [{ id: 'flat', validFrom: '2026-01-01', hourlyCost: 100 }],
    };
    const forward = costForPersonMonths(1 / 3, input);
    const canonical = personMonthsForCost(forward.cost, input);
    expect(canonical.ok).toBe(true);
    expect(forward.exactBlendedHourlyRate).not.toBeNull();
    if (!canonical.ok || forward.exactBlendedHourlyRate === null) {
      throw new Error('expected a usable person-month conversion');
    }
    const hours = forward.cost / forward.exactBlendedHourlyRate;
    const unrounded = hours / hoursPerPersonMonth(40, 22);
    expect(canonical.value).toBe(unrounded);
    expect(canonical.value).not.toBe(Number(canonical.value.toFixed(2)));
    expect(canonical.value).toBeCloseTo(1 / 3, 12);
  });

  it('fails cost conversion when the month has no effective rate', () => {
    const input = {
      month: '2026-03',
      weeklyHours: 40,
      rates: [{ id: 'april', validFrom: '2026-04-01', hourlyCost: 90 }],
    };
    expect(costForPersonMonths(0.5, input)).toMatchObject({
      cost: 0,
      coverage: { status: 'none', missingWorkingDays: 22 },
      exactBlendedHourlyRate: null,
    });
    const canonical = personMonthsForCost(1000, input);
    expect(canonical.ok).toBe(false);
    if (!canonical.ok) {
      expect(canonical.error.code).toBe('no-effective-rate');
    }
  });

  it('fails cost conversion when the blended rate is zero', () => {
    const input = {
      month: '2026-03',
      weeklyHours: 40,
      rates: [{ id: 'free', validFrom: '2026-01-01', hourlyCost: 0 }],
    };
    const canonical = personMonthsForCost(0, input);
    expect(canonical).toEqual({
      ok: false,
      error: {
        code: 'zero-blended-rate',
        month: '2026-03',
        coverage: { status: 'full' },
      },
    });
  });
});
