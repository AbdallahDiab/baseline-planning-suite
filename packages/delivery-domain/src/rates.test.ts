import { describe, expect, it } from 'vitest';
import { monthRateSchedule, priceMonthlyAllocation } from './index';
import type { HourlyRate } from './index';

const weeklyHours = 40;

function price(month: string, personMonths: number, rates: readonly HourlyRate[]) {
  return priceMonthlyAllocation({ personMonths, weeklyHours, month, rates });
}

describe('effective rate coverage', () => {
  it('treats validFrom as inclusive and keeps a rate until the next one', () => {
    const rates: HourlyRate[] = [
      { id: 'early', validFrom: '2026-03-02', hourlyCost: 10 },
      { id: 'later', validFrom: '2026-03-12', hourlyCost: 20 },
    ];
    const priced = price('2026-03', 1, rates);

    expect(priced.coverage).toEqual({ status: 'full' });
    expect(priced.splits).toEqual([
      {
        rateId: 'early',
        validFrom: '2026-03-02',
        hourlyCost: 10,
        workingDays: 8,
        hours: 64,
        cost: 640,
      },
      {
        rateId: 'later',
        validFrom: '2026-03-12',
        hourlyCost: 20,
        workingDays: 14,
        hours: 112,
        cost: 2240,
      },
    ]);
    expect(priced.cost).toBe(2880);
  });

  it('prices several rate changes inside one month, including a decrease', () => {
    const rates: HourlyRate[] = [
      { id: 'a', validFrom: '2026-01-01', hourlyCost: 10 },
      { id: 'b', validFrom: '2026-03-04', hourlyCost: 20 },
      { id: 'c', validFrom: '2026-03-18', hourlyCost: 30 },
      { id: 'd', validFrom: '2026-03-25', hourlyCost: 15 },
    ];
    const priced = price('2026-03', 1, rates);

    expect(priced.workingDays).toBe(22);
    expect(priced.coverage).toEqual({ status: 'full' });
    expect(priced.splits.map((split) => [split.rateId, split.workingDays, split.hourlyCost])).toEqual([
      ['a', 2, 10],
      ['b', 10, 20],
      ['c', 5, 30],
      ['d', 5, 15],
    ]);
    expect(priced.splits[3]?.hourlyCost).toBeLessThan(priced.splits[2]?.hourlyCost ?? 0);
    expect(priced.cost).toBe(2 * 8 * 10 + 10 * 8 * 20 + 5 * 8 * 30 + 5 * 8 * 15);
    expect(monthRateSchedule('2026-03', rates).exactBlendedHourlyRate).toBe(priced.cost / 176);
  });

  it('applies a weekend rate change on the next working day', () => {
    const rates: HourlyRate[] = [
      { id: 'before', validFrom: '2026-01-01', hourlyCost: 50 },
      { id: 'saturday', validFrom: '2026-03-14', hourlyCost: 70 },
    ];
    const march = price('2026-03', 1, rates);

    expect(march.coverage).toEqual({ status: 'full' });
    expect(march.splits).toEqual([
      {
        rateId: 'before',
        validFrom: '2026-01-01',
        hourlyCost: 50,
        workingDays: 10,
        hours: 80,
        cost: 4000,
      },
      {
        rateId: 'saturday',
        validFrom: '2026-03-14',
        hourlyCost: 70,
        workingDays: 12,
        hours: 96,
        cost: 6720,
      },
    ]);

    const august = price('2026-08', 1, [
      { id: 'before', validFrom: '2026-01-01', hourlyCost: 50 },
      { id: 'saturday', validFrom: '2026-08-01', hourlyCost: 70 },
    ]);
    expect(august.workingDays).toBe(21);
    expect(august.splits).toHaveLength(1);
    expect(august.splits[0]).toMatchObject({
      rateId: 'saturday',
      workingDays: 21,
      hourlyCost: 70,
    });
  });

  it('returns full coverage when the first rate starts on a weekend before the first working day', () => {
    const priced = price('2026-03', 0.5, [
      { id: 'sunday', validFrom: '2026-03-01', hourlyCost: 40 },
    ]);
    expect(priced.coverage).toEqual({ status: 'full' });
    expect(priced.splits[0]?.workingDays).toBe(22);
  });

  it('prices only the working days on or after the first rate', () => {
    const rates: HourlyRate[] = [{ id: 'mid', validFrom: '2026-03-16', hourlyCost: 100 }];
    const priced = price('2026-03', 0.5, rates);

    expect(priced.allocationHours).toBe(88);
    expect(priced.cost).toBe(12 * 4 * 100);
    expect(priced.coverage).toEqual({
      status: 'partial',
      missingWorkingDays: 10,
      unpricedWorkingDays: [
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-09',
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
      ],
    });
    expect(priced.splits).toEqual([
      {
        rateId: 'mid',
        validFrom: '2026-03-16',
        hourlyCost: 100,
        workingDays: 12,
        hours: 48,
        cost: 4800,
      },
    ]);
    expect(monthRateSchedule('2026-03', rates).exactBlendedHourlyRate).toBe(4800 / 88);
  });

  it('does not throw when the month is entirely before the first rate', () => {
    const rates: HourlyRate[] = [{ id: 'later', validFrom: '2026-04-01', hourlyCost: 90 }];
    const priced = price('2026-03', 0.5, rates);

    expect(priced.cost).toBe(0);
    expect(priced.allocationHours).toBe(88);
    expect(priced.blendedHourlyRate).toBe(0);
    expect(priced.splits).toEqual([]);
    expect(priced.coverage.status).toBe('none');
    if (priced.coverage.status === 'none') {
      expect(priced.coverage.missingWorkingDays).toBe(22);
      expect(priced.coverage.unpricedWorkingDays).toHaveLength(22);
    }
    expect(monthRateSchedule('2026-03', rates).exactBlendedHourlyRate).toBeNull();
    expect(monthRateSchedule('2026-03', []).exactBlendedHourlyRate).toBeNull();
  });

  it('breaks equal validFrom dates by the greater rate id', () => {
    const priced = price('2026-03', 1, [
      { id: 'rate-a', validFrom: '2026-03-01', hourlyCost: 10 },
      { id: 'rate-c', validFrom: '2026-03-01', hourlyCost: 30 },
      { id: 'rate-b', validFrom: '2026-03-01', hourlyCost: 20 },
    ]);
    expect(priced.splits).toEqual([
      {
        rateId: 'rate-c',
        validFrom: '2026-03-01',
        hourlyCost: 30,
        workingDays: 22,
        hours: 176,
        cost: 5280,
      },
    ]);
  });
});
