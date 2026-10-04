import type { DisplayCurrency, RateRecord } from '@baseline/contracts';

export function formatHourlyCost(amount: number, currency: DisplayCurrency): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function sortRatesDescending(rates: readonly RateRecord[]): RateRecord[] {
  return [...rates].sort((left, right) => {
    if (left.validFrom !== right.validFrom) {
      return left.validFrom < right.validFrom ? 1 : -1;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
}

export function formatPersonMonths(totalPersonMonths: number): string {
  return `${totalPersonMonths.toFixed(2)} PM`;
}

export function formatCapacityPercent(totalPersonMonths: number): string {
  return `${(totalPersonMonths * 100).toFixed(1)}%`;
}
