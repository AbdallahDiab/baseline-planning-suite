import type { ApiErrorBody, CapacitySummary, Employee, RateRecord } from '@baseline/contracts';

/**
 * Typed same-origin client. Presentation components do not call fetch.
 * The UI reads status, code, and message from PeopleRequestError only.
 */
export class PeopleRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PeopleRequestError';
    this.status = status;
    this.code = code;
  }
}

export function requestErrorMessage(error: unknown): string {
  if (error instanceof PeopleRequestError) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function listEmployees(search: string): Promise<Employee[]> {
  const query = search.length > 0 ? `?${new URLSearchParams({ search }).toString()}` : '';
  return request<Employee[]>(`/api/employees${query}`);
}

export function getEmployee(employeeId: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(employeeId)}`);
}

export function listCapacity(): Promise<CapacitySummary[]> {
  return request<CapacitySummary[]>('/api/capacity');
}

export interface RateWrite {
  validFrom: string;
  hourlyCost: number;
}

export function listRates(employeeId: string): Promise<RateRecord[]> {
  const query = new URLSearchParams({ employeeId });
  return request<RateRecord[]>(`/api/rates?${query.toString()}`);
}

export function createRate(employeeId: string, rate: RateWrite): Promise<RateRecord> {
  return request<RateRecord>('/api/rates', {
    method: 'POST',
    body: JSON.stringify({
      employeeId,
      validFrom: rate.validFrom,
      hourlyCost: rate.hourlyCost,
    }),
  });
}

export function updateRate(rateId: string, rate: RateWrite): Promise<RateRecord> {
  return request<RateRecord>(`/api/rates/${encodeURIComponent(rateId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      validFrom: rate.validFrom,
      hourlyCost: rate.hourlyCost,
    }),
  });
}

export function deleteRate(rateId: string): Promise<void> {
  return request<void>(`/api/rates/${encodeURIComponent(rateId)}`, {
    method: 'DELETE',
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new PeopleRequestError(0, 'network_error', 'The request could not be completed.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const parsed = await readBody(response);
  if (!response.ok) {
    throw errorFromBody(response.status, parsed);
  }
  if (parsed === undefined) {
    throw new PeopleRequestError(response.status, 'invalid_response', 'The server returned an empty response.');
  }
  return parsed as T;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PeopleRequestError(response.status, 'invalid_response', 'The server returned an unreadable response.');
  }
}

function errorFromBody(status: number, parsed: unknown): PeopleRequestError {
  if (isApiErrorBody(parsed)) {
    return new PeopleRequestError(status, parsed.error.code, parsed.error.message);
  }
  return new PeopleRequestError(status, 'request_failed', `Request failed (${status}).`);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const error: unknown = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code: unknown = (error as { code?: unknown }).code;
  const message: unknown = (error as { message?: unknown }).message;
  return typeof code === 'string' && typeof message === 'string' && code.length > 0 && message.length > 0;
}
