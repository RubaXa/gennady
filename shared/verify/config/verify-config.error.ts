// @file: Typed fail-closed diagnostics for target verify configuration and migration.
// @consumers: verify config loader, preset composer, legacy adapter
// @spec: CLI-VERIFY

/** @purpose Identify one stable class of invalid verify configuration. */
export type VerifyConfigErrorCode =
  | 'VERIFY_CONFIG_PARSE'
  | 'VERIFY_CONFIG_UNKNOWN_FIELD'
  | 'VERIFY_CONFIG_UNKNOWN_PLUGIN'
  | 'VERIFY_CONFIG_UNKNOWN_STEP'
  | 'VERIFY_CONFIG_INVALID_TYPE'
  | 'VERIFY_CONFIG_INVALID_DURATION'
  | 'VERIFY_CONFIG_INVALID_REFERENCE'
  | 'VERIFY_CONFIG_DISABLE_REASON_REQUIRED'
  | 'VERIFY_CONFIG_COMMAND_INCOMPLETE'
  | 'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED'
  | 'VERIFY_CONFIG_LEGACY_UNSUPPORTED'
  | 'VERIFY_CONFIG_INVALID_PLAN';

/** @purpose Carry one actionable config failure without exposing a partial overlay. */
export class VerifyConfigError extends Error {
  /** @purpose Stable machine-readable failure class. */
  readonly code: VerifyConfigErrorCode;
  /** @purpose Exact dotted config path responsible for the failure. */
  readonly path: string;
  /** @purpose Winning config source when one can be identified. */
  readonly source: string | null;
  /** @purpose Concrete migration or repair instruction. */
  readonly hint: string;

  /**
   * @purpose Create one typed target-config or migration failure.
   * @param code Stable failure class.
   * @param path Exact dotted config path.
   * @param message Human-readable explanation.
   * @param hint Concrete repair or migration instruction.
   * @param [source] Winning source identity.
   */
  constructor(
    code: VerifyConfigErrorCode,
    path: string,
    message: string,
    hint: string,
    source: string | null = null
  ) {
    super(
      `[VerifyConfigError:${code}] ${path}${source === null ? '' : ` (${source})`}: ${message}; ${hint}`
    );
    this.name = 'VerifyConfigError';
    this.code = code;
    this.path = path;
    this.source = source;
    this.hint = hint;
  }
}
