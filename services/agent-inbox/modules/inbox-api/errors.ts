// @file: ApiError — structured error types and helper for inbox-api HTTP responses.
// @consumers: inbox-api routers, http-server
// @tasks: TSK-106

import type { InboxErrorCode } from '../inbox-core/errors.ts';

/** @purpose Structured error response for HTTP API errors — format: { ok: false, error, detail }. */
export type ApiErrorResponse = {
  /** @purpose Always false on error */
  ok: false;
  /** @purpose Machine-readable error code */
  error: InboxErrorCode;
  /** @purpose Human-readable detail */
  detail: string;
};

/** @purpose HTTP-specific error with status code for the API layer. */
export class ApiError extends Error {
  /** @purpose HTTP status code */
  readonly statusCode: number;
  /** @purpose Machine-readable error code */
  readonly code: InboxErrorCode;

  /**
   * @purpose Create an ApiError with HTTP status and machine-readable code.
   * @param statusCode HTTP status code.
   * @param code Machine-readable error code.
   * @param detail Human-readable error detail.
   */
  constructor(statusCode: number, code: InboxErrorCode, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }

  /**
   * @purpose Convert this error to the standard API error response shape.
   * @returns Structured error response { ok: false, error, detail }.
   */
  toResponse(): ApiErrorResponse {
    return { ok: false, error: this.code, detail: this.message };
  }
}

/**
 * @purpose Create a NOT_FOUND error for unknown MRs or resources.
 * @param detail Human-readable detail.
 * @returns ApiError with 404 / NOT_FOUND.
 */
export function notFound(detail: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', detail);
}

/**
 * @purpose Create a BAD_REQUEST error for invalid request bodies.
 * @param detail Human-readable detail.
 * @returns ApiError with 400 / CONFIG (reused for validation errors).
 */
export function badRequest(detail: string): ApiError {
  return new ApiError(400, 'CONFIG', detail);
}
