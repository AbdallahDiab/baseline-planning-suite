export function formatPersonMonths(totalPersonMonths: number): string {
  return `${totalPersonMonths.toFixed(2)} PM`;
}

export function formatCapacityPercent(totalPersonMonths: number): string {
  return `${(totalPersonMonths * 100).toFixed(1)}%`;
}
