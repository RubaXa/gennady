// @file: Typed fail-closed diagnostics for verify DAG planning.
// @consumers: verify plan validation and phase selection
// @spec: CLI-VERIFY

/** @purpose Identify one stable class of invalid verify plan input. */
export type VerifyPlanErrorCode =
  | 'VERIFY_PLAN_INVALID_ID'
  | 'VERIFY_PLAN_DUPLICATE_PLUGIN'
  | 'VERIFY_PLAN_DUPLICATE_STEP'
  | 'VERIFY_PLAN_PLUGIN_MISMATCH'
  | 'VERIFY_PLAN_DUPLICATE_REFERENCE'
  | 'VERIFY_PLAN_MISSING_DEPENDENCY'
  | 'VERIFY_PLAN_MISSING_INVALIDATION_TARGET'
  | 'VERIFY_PLAN_CYCLE'
  | 'VERIFY_PLAN_UNKNOWN_PHASE'
  | 'VERIFY_PLAN_UNKNOWN_TAG';

/** @purpose Carry machine-readable planning context without constraining each error code to one payload. */
export type VerifyPlanErrorDetails = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** @purpose Fail closed with a stable code and actionable verify planning context. */
export class VerifyPlanError extends Error {
  /** @purpose Stable machine-readable planner failure class. */
  readonly code: VerifyPlanErrorCode;
  /** @purpose Qualified ids and selector context needed to diagnose the failure. */
  readonly details: VerifyPlanErrorDetails;

  /**
   * @purpose Create one typed planner failure.
   * @param code Stable planner failure class.
   * @param message Actionable human-readable diagnostic.
   * @param [details] Machine-readable qualified planning context.
   */
  constructor(code: VerifyPlanErrorCode, message: string, details: VerifyPlanErrorDetails = {}) {
    super(`[VerifyPlanError] ${message}`);
    this.name = 'VerifyPlanError';
    this.code = code;
    this.details = details;
  }
}
