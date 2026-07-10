// @file: Structured error codes and error-response types for the agent-inbox scope (AI-22).
// @consumers: inbox-core, inbox-api, inbox-roles, CLI
// @tasks: TSK-109

import { logger } from '#logger';

/** @purpose Machine-readable error codes across all agent-inbox commands (AI-22). */
export type InboxErrorCode =
  | 'NETWORK'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'INVALID_REF'
  | 'CONFIG'
  | 'WORKTREE';

/** @purpose Structured error response contract — all commands return this shape on failure (AI-22). */
export type InboxErrorResponse = {
  /** @purpose Always false on error | @invariant false */
  ok: false;
  /** @purpose Machine-readable error code */
  error: InboxErrorCode;
  /** @purpose Human-readable detail for display or debugging */
  detail: string;
};

/**
 * @purpose Create a structured InboxErrorResponse, log it, and return it.
 * @param code Machine-readable error code.
 * @param detail Human-readable detail.
 * @param [cause] Optional underlying cause for logging.
 * @returns Structured error response.
 */
export function composeInboxError(
  code: InboxErrorCode,
  detail: string,
  cause?: unknown
): InboxErrorResponse {
  logger.error(`[composeInboxError] [idle → error_emitted] ${code}: ${detail}`, {
    error: { code, detail, cause },
  });
  return { ok: false, error: code, detail };
}
