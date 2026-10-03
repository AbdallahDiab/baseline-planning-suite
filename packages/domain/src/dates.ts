const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

export function parseIsoDate(value: string): CalendarDate {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${String(date.year).padStart(4, '0')}-${month}-${day}`;
}

export function parseYearMonth(value: string): { year: number; month: number } {
  const match = YEAR_MONTH.exec(value);
  if (!match) {
    throw new Error(`Invalid year-month: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid year-month: ${value}`);
  }
  return { year, month };
}

/**
 * Sunday = 0 ... Saturday = 6.
 * Sakamoto's method uses the civil calendar directly, so the result does not
 * depend on the host timezone.
 */
export function weekdaySunday0(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const adjustedYear = month < 3 ? year - 1 : year;
  const weekday =
    adjustedYear +
    Math.floor(adjustedYear / 4) -
    Math.floor(adjustedYear / 100) +
    Math.floor(adjustedYear / 400) +
    (offsets[month - 1] ?? 0) +
    day;
  return ((weekday % 7) + 7) % 7;
}

export function compareIsoDate(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Monday through Friday. Public holidays are ignored. */
export function listWorkingDays(year: number, month: number): string[] {
  const total = daysInMonth(year, month);
  const days: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    const weekday = weekdaySunday0(year, month, day);
    if (weekday !== 0 && weekday !== 6) {
      days.push(formatIsoDate({ year, month, day }));
    }
  }
  return days;
}
