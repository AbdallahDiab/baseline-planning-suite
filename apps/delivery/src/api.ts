import type { Allocation, ApiErrorBody, BreakdownItem, Project } from '@baseline/contracts';

/**
 * Typed same-origin client. Presentation components do not call fetch.
 * The UI reads status, code, and message from DeliveryRequestError only.
 */
export class DeliveryRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DeliveryRequestError';
    this.status = status;
    this.code = code;
  }
}

export function requestErrorMessage(error: unknown): string {
  if (error instanceof DeliveryRequestError) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>('/api/projects');
}

export function listProjectWbs(projectId: string): Promise<BreakdownItem[]> {
  return request<BreakdownItem[]>(`/api/projects/${encodeURIComponent(projectId)}/wbs`);
}

export function listProjectAllocations(projectId: string): Promise<Allocation[]> {
  return request<Allocation[]>(`/api/projects/${encodeURIComponent(projectId)}/allocations`);
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
    throw new DeliveryRequestError(0, 'network_error', 'The request could not be completed.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const parsed = await readBody(response);
  if (!response.ok) {
    throw errorFromBody(response.status, parsed);
  }
  if (parsed === undefined) {
    throw new DeliveryRequestError(response.status, 'invalid_response', 'The server returned an empty response.');
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
    throw new DeliveryRequestError(response.status, 'invalid_response', 'The server returned an unreadable response.');
  }
}

function errorFromBody(status: number, parsed: unknown): DeliveryRequestError {
  if (isApiErrorBody(parsed)) {
    return new DeliveryRequestError(status, parsed.error.code, parsed.error.message);
  }
  return new DeliveryRequestError(status, 'request_failed', `Request failed (${status}).`);
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
