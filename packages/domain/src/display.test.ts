import { describe, expect, it } from 'vitest';
import {
  distributeLargestRemainder,
  formatCost,
  formatHours,
  formatPersonMonths,
  roundDisplay,
} from './index';

function independentMinorSum(values: readonly number[], fractionDigits: number): number {
  const scale = 10 ** fractionDigits;
  return values.reduce((sum, value) => sum + Math.round(roundDisplay(value, fractionDigits) * scale), 0);
}

describe('display rounding', () => {
  it('gives the first tied cell the extra unit so the cells sum to the rounded total', () => {
    const exact = [1.004, 1.004, 1.004];
    const distributed = distributeLargestRemainder(exact, 2);

    expect(independentMinorSum(exact, 2)).toBe(300);
    expect(distributed.totalMinor).toBe(301);
    expect(distributed.minorUnits).toEqual([101, 100, 100]);
    expect(distributed.cells).toEqual([1.01, 1, 1]);
    expect(distributed.minorUnits.reduce((sum, minor) => sum + minor, 0)).toBe(distributed.totalMinor);
    expect(distributed.total).toBe(3.01);
  });

  it('removes the surplus created by rounding each cell on its own', () => {
    const exact = [0.335, 0.335, 0.33];
    const distributed = distributeLargestRemainder(exact, 2);

    expect(independentMinorSum(exact, 2)).toBe(101);
    expect(distributed.totalMinor).toBe(100);
    expect(distributed.minorUnits).toEqual([34, 33, 33]);
    expect(distributed.minorUnits.reduce((sum, minor) => sum + minor, 0)).toBe(100);
  });

  it('distributes a repeating total that independent rounding would shorten', () => {
    const exact = [10 / 3, 10 / 3, 10 / 3];
    const distributed = distributeLargestRemainder(exact, 2);

    expect(roundDisplay(10 / 3, 2)).toBe(3.33);
    expect(independentMinorSum(exact, 2)).toBe(999);
    expect(distributed.totalMinor).toBe(1000);
    expect(distributed.minorUnits).toEqual([334, 333, 333]);
    expect(distributed.cells.reduce((sum, cell) => sum + Math.round(cell * 100), 0)).toBe(1000);
  });

  it('distributes a negative total the same way', () => {
    const exact = [-1.004, -1.004, -1.004];
    const distributed = distributeLargestRemainder(exact, 2);

    expect(independentMinorSum(exact, 2)).toBe(-300);
    expect(distributed.totalMinor).toBe(-301);
    expect(distributed.minorUnits).toEqual([-100, -100, -101]);
    expect(distributed.minorUnits.reduce((sum, minor) => sum + minor, 0)).toBe(-301);
  });

  it('rounds a single value half away from zero and formats display units', () => {
    expect(roundDisplay(1.225, 2)).toBe(1.23);
    expect(roundDisplay(2.675, 2)).toBe(2.68);
    expect(roundDisplay(-1.225, 2)).toBe(-1.23);
    expect(formatHours(88)).toBe('88.00');
    expect(formatPersonMonths(0.5)).toBe('0.50');
    expect(formatPersonMonths(1 / 3)).toBe('0.33');
    expect(formatCost(7880)).toBe('7880.00');
    expect(distributeLargestRemainder([], 2)).toEqual({
      fractionDigits: 2,
      minorUnits: [],
      cells: [],
      totalMinor: 0,
      total: 0,
    });
  });
});
