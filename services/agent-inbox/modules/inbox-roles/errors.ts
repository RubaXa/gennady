// @file: Role-specific error types and factory for the inbox-roles module.
// @consumers: role-engine, role-instance, role-scheduler
// @tasks: TSK-113

/**
 * @purpose All possible role engine error codes.
 */
export type RoleErrorCode =
  | 'ROLE_NOT_FOUND'
  | 'ROLE_ALREADY_ACTIVE'
  | 'ROLE_NOT_ACTIVE'
  | 'GRAPH_INVALID'
  | 'NODE_NOT_FOUND'
  | 'EDGE_AMBIGUOUS'
  | 'RECOVERY_EXHAUSTED'
  | 'EFFECT_ALREADY_APPLIED'
  | 'ESCALATION_COOLDOWN';

/**
 * @purpose Structured role error — thrown by role engine, scheduler, and instances.
 */
export class RoleError extends Error {
  /** @purpose Machine-readable error code */
  code: RoleErrorCode;
  /** @purpose Optional structured details (e.g. node id, MR url) */
  details?: Record<string, unknown>;

  /**
   * @purpose Create a structured role error with code, message, and optional details.
   * @param code Machine-readable error code.
   * @param message Human-readable error description.
   * @param [details] Optional structured context.
   */
  constructor(code: RoleErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'RoleError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @purpose Lifecycle state of a RoleInstance.
 * @consumer RoleInstance, RoleScheduler
 */
export type InstanceState = 'idle' | 'running' | 'awaiting_operator' | 'done' | 'error';

/**
 * @purpose Recovery signal emitted by OutcomeClassifier — directs the recovery ladder.
 */
export type RecoverySignal = 'continue' | 'restart' | 'await_operator';
