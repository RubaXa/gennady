// @file: ChatError codes and structured error-response helper for inbox-chat (mirrors inbox-core/errors.ts composeInboxError + inbox-opencode/errors.ts composeError shape).
// @consumers: ChatSession, MutationApplier (TSK-127)
// @tasks: TSK-126

import { logger } from '#logger';

/** @purpose Machine-readable error codes for chat/mutation operations. */
export type ChatErrorCode = 'TURN_IN_FLIGHT' | 'STALE_REVISION' | 'SESSION_ERROR';

/** @purpose Structured error response — chat/mutation operations return this shape on failure. */
export type ChatErrorResponse = {
  /** @purpose Always false on error | @invariant false */
  ok: false;
  /** @purpose Machine-readable error code */
  error: ChatErrorCode;
  /** @purpose Human-readable detail for display or debugging */
  detail: string;
};

/**
 * @purpose Create a structured ChatErrorResponse and log it.
 * @param code Machine-readable error code.
 * @param detail Human-readable detail.
 * @param [cause] Optional underlying cause for logging.
 * @returns Structured error response.
 */
export function composeChatError(
  code: ChatErrorCode,
  detail: string,
  cause?: unknown
): ChatErrorResponse {
  logger.error(`[composeChatError] [idle → error_emitted] ${code}: ${detail}`, {
    error: { code, detail, cause },
  });
  return { ok: false, error: code, detail };
}
