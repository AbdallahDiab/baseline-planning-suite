import { parseIsoDate } from './dates';

const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Days since 1970-01-01. Howard Hinnant's civil-from-days algorithm,
 * evaluated with integer arithmetic so it does not use the host timezone.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shiftedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function offsetMillis(offset: string): number {
  if (offset === 'Z') {
    return 0;
  }
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid timestamp offset: ${offset}`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (Number(match[2]) > 23 || Number(match[3]) > 59) {
    throw new Error(`Invalid timestamp offset: ${offset}`);
  }
  return (match[1] === '-' ? -1 : 1) * minutes * 60 * 1000;
}

/** UTC nanoseconds since 1970-01-01T00:00:00Z. */
export function instantNanos(value: string): bigint {
  const match = INSTANT.exec(value);
  if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5] || !match[6] || !match[8]) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  parseIsoDate(`${match[1]}-${match[2]}-${match[3]}`);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  const fraction = (match[7] ?? '').padEnd(9, '0');
  const nanos = BigInt(fraction);
  const utcNanos =
    BigInt(daysFromCivil(year, month, day)) * 86_400_000_000_000n +
    BigInt(hour) * 3_600_000_000_000n +
    BigInt(minute) * 60_000_000_000n +
    BigInt(second) * 1_000_000_000n +
    nanos -
    BigInt(offsetMillis(match[8])) * 1_000_000n;
  return utcNanos;
}

/** Negative when `left` is earlier than `right`. Equal instants compare as 0. */
export function compareInstant(left: string, right: string): number {
  const leftNanos = instantNanos(left);
  const rightNanos = instantNanos(right);
  if (leftNanos < rightNanos) {
    return -1;
  }
  if (leftNanos > rightNanos) {
    return 1;
  }
  return 0;
}
