// @file: Pure error-mapping utility for opencode subprocess failures.
// @consumers: OpencodeEngine
// @tasks: TSK-63, TSK-64

import type { ErrorCode } from '../../core/agent-run-error.ts';

/**
 * @purpose Normalized descriptor of an opencode subprocess failure passed to the error map.
 * @invariant Exactly one of `spawnErrorCode` or `exitCode` is meaningful per invocation.
 */
export type OpencodeFailure = {
  /** @purpose Node.js spawn `error.code` when the binary cannot be launched (e.g. ENOENT, EACCES) */
  spawnErrorCode?: string;
  /** @purpose Process exit code when the binary launched but exited non-zero */
  exitCode?: number;
  /** @purpose Captured stderr text from the subprocess */
  stderr?: string;
};

/**
 * @purpose Mapping result: typed error code and human-readable operator hint.
 */
export type OpencodeErrorMapping = {
  /** @purpose Machine-readable failure category for programmatic branching */
  code: ErrorCode;
  /** @purpose Human-readable remediation hint addressed to the operator */
  hint: string;
};

// invariant: both case variants must be stripped (libcurl + Node read lower-case too)
const PROXY_PATTERN = /ERR_ACCESS_DENIED|403|proxy/i;

// invariant: intentionally wide — opencode error text is fragile across versions
const SCHEMA_PATTERN = /constraint failed.*session_message|database schema|migration/i;

// invariant: covers common opencode wording for unknown model identifiers
const MODEL_UNAVAILABLE_PATTERN = /unknown model|no such model|model not found/i;

/**
 * @purpose Translate a raw opencode subprocess failure descriptor into a typed ErrorCode and operator hint.
 * @invariant Never throws; always returns a valid `ErrorCode`.
 * @invariant `TIMEOUT` is NOT mapped here — `OpencodeEngine` throws `AgentRunError('TIMEOUT')` directly by timer.
 * @invariant Pattern matching order matters: spawn errors checked first, then stderr patterns, then fallback.
 * @param failure Normalized failure descriptor from `OpencodeEngine`.
 * @returns Typed `{ code, hint }` ready for `AgentRunError` construction.
 */
export function opencodeErrorMap(failure: OpencodeFailure): OpencodeErrorMapping {
  const { spawnErrorCode, stderr = '' } = failure;

  // #region START_SPAWN_ERROR_MAPPING — failure mode: binary missing/unexecutable → AGENT_NOT_INSTALLED
  if (spawnErrorCode === 'ENOENT' || spawnErrorCode === 'EACCES') {
    return {
      code: 'AGENT_NOT_INSTALLED',
      hint: 'opencode binary not found or not executable. Install it: brew install opencode',
    };
  }
  // #endregion END_SPAWN_ERROR_MAPPING

  // #region START_STDERR_PATTERN_MATCHING
  // ORDER MATTERS: MODEL_UNAVAILABLE must be checked before PROXY_PATTERN.
  // The default model id "llm-proxy/deepseek-v4-pro" contains the word "proxy",
  // so an "unknown model: llm-proxy/deepseek-v4-pro" message would mis-classify
  // as NETWORK_BLOCKED if PROXY_PATTERN were checked first. Specific-before-general.
  if (MODEL_UNAVAILABLE_PATTERN.test(stderr)) {
    return {
      code: 'MODEL_UNAVAILABLE',
      hint: 'The requested model is not available. Use listModels() to retrieve the list of available models.',
    };
  }

  if (PROXY_PATTERN.test(stderr)) {
    return {
      code: 'NETWORK_BLOCKED',
      hint: 'Network access blocked — likely a proxy intercept. Unset HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy, ALL_PROXY, all_proxy before running.',
    };
  }

  if (SCHEMA_PATTERN.test(stderr)) {
    return {
      code: 'VERSION_MISMATCH',
      hint: 'opencode schema mismatch detected. If CLI is outdated: brew upgrade opencode. If opencode App is outdated: update it from the App Store or official release.',
    };
  }

  if (/Forbidden/i.test(stderr)) {
    return {
      code: 'MODEL_FORBIDDEN',
      hint: 'Model access forbidden. Verify your API key has access to the requested model and provider.',
    };
  }

  if (/API key.*missing|missing.*API key/i.test(stderr)) {
    return {
      code: 'CREDENTIAL_MISSING',
      hint: 'Provider API key is missing. Set the appropriate environment variable (e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY).',
    };
  }
  // #endregion END_STDERR_PATTERN_MATCHING

  // #region START_FALLBACK_LAUNCH_FAILED — non-goal: preserving raw stderr is intentional even when noisy
  const rawHint = stderr.trim()
    ? `Launch failed — причина не распознана. Raw stderr: ${stderr.trim()}`
    : 'Launch failed — причина не распознана. No stderr output captured.';

  return {
    code: 'LAUNCH_FAILED',
    hint: rawHint,
  };
  // #endregion END_FALLBACK_LAUNCH_FAILED
}
