/** Display-only rounding. Do not write this result back into canonical amounts. */
export function formatHourlyRate(rate: number, fractionDigits: number): string {
  return rate.toFixed(fractionDigits);
}

/** Display-only percent. Canonical capacity stays in person-months. */
export function formatCapacityPercent(personMonths: number): string {
  return `${(personMonths * 100).toFixed(1)}%`;
}
