import type { ZodType } from 'zod';
import { z } from 'zod';
import { invalidRequest } from './errors';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, 'Expected a YYYY-MM-DD date')
  .refine(isRealIsoDate, 'Expected a real YYYY-MM-DD date');

export const yearMonthSchema = z.string().regex(YEAR_MONTH, 'Expected a YYYY-MM month');

export const finiteNonNegativeSchema = z.number().finite().nonnegative();

export const createRateSchema = z.object({
  employeeId: z.string().min(1),
  validFrom: isoDateSchema,
  hourlyCost: finiteNonNegativeSchema,
});

export const patchRateSchema = z
  .object({
    validFrom: isoDateSchema.optional(),
    hourlyCost: finiteNonNegativeSchema.optional(),
  })
  .refine((value) => value.validFrom !== undefined || value.hourlyCost !== undefined, {
    message: 'At least one of validFrom or hourlyCost is required',
  });

export const createWbsSchema = z.object({
  parentId: z.string().min(1).nullable(),
  name: z.string().trim().min(1),
});

export const patchWbsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export const allocationCellSchema = z.object({
  breakdownItemId: z.string().min(1),
  employeeId: z.string().min(1),
  month: yearMonthSchema,
  amount: finiteNonNegativeSchema,
});

export const employeeQuerySchema = z.object({
  search: z.string().optional(),
});

export const rateQuerySchema = z.object({
  employeeId: z.string().min(1).optional(),
});

export const capacityQuerySchema = z.object({
  employeeId: z.string().min(1).optional(),
  month: yearMonthSchema.optional(),
});

export interface WbsPatch {
  name?: string;
  parentId?: string | null;
  parentProvided: boolean;
}

export function parseSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw invalidRequest(message);
  }
  return result.data;
}

export function parseWbsPatch(value: unknown): WbsPatch {
  const record = expectObject(value);
  const parentProvided = Object.prototype.hasOwnProperty.call(record, 'parentId');
  const nameProvided = Object.prototype.hasOwnProperty.call(record, 'name');
  if (!parentProvided && !nameProvided) {
    throw invalidRequest('At least one of name or parentId is required');
  }
  const parsed = parseSchema(patchWbsSchema, value);
  return {
    name: nameProvided ? parsed.name : undefined,
    parentId: parentProvided ? parsed.parentId : undefined,
    parentProvided,
  };
}

export async function readJsonBody(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw invalidRequest('Request body must be valid JSON');
  }
}

function expectObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRequest('Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
