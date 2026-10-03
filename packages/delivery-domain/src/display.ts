/**
 * Display-boundary rounding. Results are not canonical state.
 * Collections use largest-remainder distribution so the rounded total
 * equals the sum of the rounded cells in minor units.
 */

const SIGNIFICANT_DIGITS = 15;
const EXTRA_DIGITS = 8;

export interface DisplayDistribution {
  fractionDigits: number;
  /** Integer counts of the display unit, for example cents when fractionDigits is 2. */
  minorUnits: readonly number[];
  /** Display numbers. Do not write these back into canonical amounts. */
  cells: readonly number[];
  totalMinor: number;
  total: number;
}

function tenPow(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function assertFractionDigits(fractionDigits: number): void {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 8) {
    throw new Error(`Unsupported display precision: ${fractionDigits}`);
  }
}

function scientificDigits(value: number): { negative: boolean; digits: bigint; exponent: number } {
  const rendered = Math.abs(value).toExponential(SIGNIFICANT_DIGITS - 1);
  const match = /^(\d)\.(\d+)e([+-]?\d+)$/.exec(rendered);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Cannot read decimal expansion of ${value}`);
  }
  return {
    negative: value < 0,
    digits: BigInt(match[1] + match[2]),
    exponent: Number(match[3]),
  };
}

/** Integer count of 10^-(fractionDigits + EXTRA_DIGITS), rounded half away from zero. */
function toFineUnits(value: number, fractionDigits: number): bigint {
  if (!Number.isFinite(value)) {
    throw new Error('Display rounding requires a finite number');
  }
  if (value === 0) {
    return 0n;
  }
  const { negative, digits, exponent } = scientificDigits(value);
  const power = exponent - (SIGNIFICANT_DIGITS - 1) + fractionDigits + EXTRA_DIGITS;
  let magnitude: bigint;
  if (power >= 0) {
    magnitude = digits * tenPow(power);
  } else {
    const divisor = tenPow(-power);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    magnitude = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }
  return negative ? -magnitude : magnitude;
}

function roundFineToMinor(fine: bigint): bigint {
  const factor = tenPow(EXTRA_DIGITS);
  const negative = fine < 0n;
  const magnitude = negative ? -fine : fine;
  const quotient = magnitude / factor;
  const remainder = magnitude % factor;
  const rounded = remainder * 2n >= factor ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function floorFineToMinor(fine: bigint): { minor: bigint; fraction: bigint } {
  const factor = tenPow(EXTRA_DIGITS);
  let minor = fine / factor;
  let fraction = fine % factor;
  if (fraction < 0n) {
    minor -= 1n;
    fraction += factor;
  }
  return { minor, fraction };
}

function minorToNumber(minor: bigint): number {
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Display minor unit exceeds Number.MAX_SAFE_INTEGER');
  }
  return Number(minor);
}

/**
 * Spread the rounded exact total across cells.
 * Ties go to the earlier cell when a unit is added, and to the later cell when a unit is removed.
 */
export function distributeLargestRemainder(
  exactValues: readonly number[],
  fractionDigits: number,
): DisplayDistribution {
  assertFractionDigits(fractionDigits);
  if (exactValues.length === 0) {
    return { fractionDigits, minorUnits: [], cells: [], totalMinor: 0, total: 0 };
  }

  const fines = exactValues.map((value) => toFineUnits(value, fractionDigits));
  const parts = fines.map((fine) => floorFineToMinor(fine));
  const fineSum = fines.reduce((sum, fine) => sum + fine, 0n);
  const target = roundFineToMinor(fineSum);
  let leftover = target - parts.reduce((sum, part) => sum + part.minor, 0n);

  const priority = parts.map((part, index) => ({ index, fraction: part.fraction }));
  if (leftover > 0n) {
    priority.sort((left, right) => {
      if (left.fraction === right.fraction) {
        return left.index - right.index;
      }
      return left.fraction > right.fraction ? -1 : 1;
    });
  } else if (leftover < 0n) {
    priority.sort((left, right) => {
      if (left.fraction === right.fraction) {
        return right.index - left.index;
      }
      return left.fraction < right.fraction ? -1 : 1;
    });
  }

  const minors = parts.map((part) => part.minor);
  let cursor = 0;
  while (leftover !== 0n) {
    const slot = priority[cursor];
    if (!slot || cursor >= priority.length) {
      throw new Error('Display remainder exceeded one unit per cell');
    }
    const current = minors[slot.index];
    if (current === undefined) {
      throw new Error('Missing display cell');
    }
    if (leftover > 0n) {
      minors[slot.index] = current + 1n;
      leftover -= 1n;
    } else {
      minors[slot.index] = current - 1n;
      leftover += 1n;
    }
    cursor += 1;
  }

  const scale = 10 ** fractionDigits;
  const minorUnits = minors.map((minor) => minorToNumber(minor));
  const totalMinor = minorToNumber(target);
  return {
    fractionDigits,
    minorUnits,
    cells: minorUnits.map((minor) => minor / scale),
    totalMinor,
    total: totalMinor / scale,
  };
}

/** Round one value half away from zero at the display boundary. */
export function roundDisplay(value: number, fractionDigits: number): number {
  return distributeLargestRemainder([value], fractionDigits).total;
}

export function formatDisplay(value: number, fractionDigits: number): string {
  return roundDisplay(value, fractionDigits).toFixed(fractionDigits);
}

export function formatHours(hours: number): string {
  return formatDisplay(hours, 2);
}

export function formatPersonMonths(personMonths: number): string {
  return formatDisplay(personMonths, 2);
}

export function formatCost(cost: number): string {
  return formatDisplay(cost, 2);
}
