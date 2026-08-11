// @file: OpenCode outcome classes, structured error result, and error factory for the inbox-opencode module.
// @consumers: inbox-opencode (port, mock, pool), inbox-roles
// @tasks: TSK-111, TSK-175

/**
 * @purpose All possible AI-node outcome classes — the recovery ladder in inbox-roles
 * dispatches on these.
 */
export type OutcomeClass =
  | 'OK'
  | 'NO_RESULT'
  | 'PARSE_ERROR'
  | 'SCHEMA_MISMATCH'
  | 'SESSION_ERROR'
  | 'TIMEOUT'
  | 'INCOMPLETE_ARTIFACT';

/** @purpose Structured error payload returned by OpenCodePort when a prompt fails. */
export type OpenCodeErrorResult = {
  /** @purpose Machine-readable outcome class for recovery dispatch */
  class: OutcomeClass;
  /** @purpose Human-readable hint for auto-remediation (e.g. "Fix JSON at line 5") */
  signal?: string;
  /** @purpose Extra structured context — mismatched fields, partial output, etc. */
  details?: Record<string, unknown>;
  /** @purpose Raw response text, preserved for debugging and retry context */
  raw?: string;
  /** @purpose Explicit retry instruction retained across the agent-runtime boundary. */
  retry?: AgentRetryMetadata;
};

/** @purpose Observable retry policy for a failed agent-runtime turn. */
export type AgentRetryMetadata = {
  /** @purpose Whether the same logical task may be attempted again. */
  retryable: boolean;
  /** @purpose Next recovery action selected from the existing outcome ladder. */
  action: 'continue' | 'fresh_run' | 'operator';
};

/** @purpose Discriminated union: either a successful structured output or an error. */
export type OpenCodeCallResult =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; error: OpenCodeErrorResult };

/**
 * @purpose Compose a structured error result with a human-readable signal.
 * @param errorClass The outcome class.
 * @param signal Human-readable recovery hint.
 * @param [details] Optional extra context.
 * @returns Structured error result (always ok: false).
 */
export function composeError(
  errorClass: OutcomeClass,
  signal: string,
  details?: Record<string, unknown>
): OpenCodeCallResult & { ok: false } {
  const raw = typeof details?.raw === 'string' ? details.raw : undefined;
  return {
    ok: false,
    error: { class: errorClass, signal, details, raw },
  };
}

/**
 * @purpose Compose a successful structured output result.
 * @param output The structured output payload.
 * @returns Successful result (always ok: true).
 */
export function composeOk(output: Record<string, unknown>): OpenCodeCallResult & { ok: true } {
  return { ok: true, output };
}
