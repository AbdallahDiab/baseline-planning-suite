import type { ApiErrorBody } from '@baseline/contracts';

export type ApiStatus = 400 | 404 | 409 | 500;

export class ApiError extends Error {
  readonly status: ApiStatus;
  readonly code: string;

  constructor(status: ApiStatus, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function apiErrorBody(error: ApiError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}

export function notFound(message: string): ApiError {
  return new ApiError(404, 'not_found', message);
}

export function invalidRequest(message: string): ApiError {
  return new ApiError(400, 'invalid_request', message);
}

export function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message);
}
