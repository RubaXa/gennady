// @file: Typed error class and error code union for the agent-run module.
// @consumers: run, registry, AgentEngine implementations, CLI commands
// @tasks: TSK-62

/**
 * @purpose Exhaustive set of failure modes in the agent-run module.
 * @invariant Exactly 7 members; adding a new failure mode requires a spec update.
 */
export type ErrorCode =
  | 'AGENT_NOT_INSTALLED'
  | 'NETWORK_BLOCKED'
  | 'VERSION_MISMATCH'
  | 'MODEL_FORBIDDEN'
  | 'CREDENTIAL_MISSING'
  | 'TIMEOUT'
  | 'LAUNCH_FAILED';

/**
 * @purpose Typed error carrier for agent-run failures — machine `code` for programmatic handling + human `hint` for operator action.
 * @invariant `code` is always a member of `ErrorCode`.
 * @invariant `hint` is non-empty and addressed to a human operator (what to do next).
 */
export class AgentRunError extends Error {
  /** @purpose Machine-readable failure category for programmatic branching | @invariant Always a member of `ErrorCode` */
  readonly code: ErrorCode;
  /** @purpose Human-readable operator hint — what to do next | @invariant Non-empty */
  readonly hint: string;

  /**
   * @purpose Construct a typed agent-run failure with code and operator hint.
   * @param code Failure category from `ErrorCode`.
   * @param hint Non-empty, human-addressed description of the failure and remediation.
   */
  constructor(code: ErrorCode, hint: string) {
    super(`[AgentRunError] ${code}: ${hint}`);
    this.code = code;
    this.hint = hint;
    this.name = 'AgentRunError';
  }
}
