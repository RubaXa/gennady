// @file: OutcomeClassifier — classifies raw AI-node output into 7 outcome classes and generates remediation signals.
// @consumers: RoleInstance.step()
// @tasks: TSK-113

import type { OpenCodeCallResult } from '../inbox-opencode/errors.ts';

/**
 * @purpose Outcome class — one of 7 possible classifications of AI-node output.
 * @consumer RoleInstance, RecoveryLadder
 */
export type ClassifiedOutcome =
  | { class: 'OK'; output: Record<string, unknown> }
  | { class: 'NO_RESULT'; signal: string; details?: Record<string, unknown> }
  | { class: 'PARSE_ERROR'; signal: string; details?: Record<string, unknown> }
  | { class: 'SCHEMA_MISMATCH'; signal: string; details?: Record<string, unknown> }
  | { class: 'SESSION_ERROR'; signal: string; details?: Record<string, unknown> }
  | { class: 'TIMEOUT'; signal: string; details?: Record<string, unknown> }
  | { class: 'INCOMPLETE_ARTIFACT'; signal: string; details?: Record<string, unknown> };

/**
 * @purpose Remediation action derived from the outcome class.
 * @consumer RoleInstance.recover()
 */
export type RemediationAction =
  | { action: 'proceed' }
  | { action: 'continue'; signal: string; details?: Record<string, unknown> }
  | { action: 'restart'; signal: string; details?: Record<string, unknown> }
  | { action: 'await_operator'; signal: string; details?: Record<string, unknown> };

/**
 * @purpose Classifies raw OpenCodeCallResult into one of 7 outcome classes
 * and generates a remediation signal with concrete recovery hints.
 * @invariant Postcondition: every result maps to exactly one class with a signal.
 * @consumer RoleInstance.step()
 */
export class OutcomeClassifier {
  /**
   * @purpose Classify a raw OpenCodeCallResult and produce a structured outcome.
   * @param result The raw call result from an OpenCodePort prompt.
   * @returns Classified outcome with remediation signal.
   */
  classify(result: OpenCodeCallResult): ClassifiedOutcome {
    if (result.ok) {
      return { class: 'OK', output: result.output };
    }

    const { error } = result;
    const signal = error.signal ?? `AI-node returned ${error.class}`;
    const details = error.details;

    switch (error.class) {
      case 'OK':
        // Unreachable: ok: true handled above.
        // Fall through to PARSE_ERROR as safety net.
        return {
          class: 'PARSE_ERROR',
          signal: 'AI-node returned OK flag on error path — treating as parse error',
        };

      case 'NO_RESULT':
        return { class: 'NO_RESULT', signal, details };

      case 'PARSE_ERROR':
        return { class: 'PARSE_ERROR', signal, details };

      case 'SCHEMA_MISMATCH':
        return { class: 'SCHEMA_MISMATCH', signal, details };

      case 'SESSION_ERROR':
        return { class: 'SESSION_ERROR', signal, details };

      case 'TIMEOUT':
        return { class: 'TIMEOUT', signal, details };

      case 'INCOMPLETE_ARTIFACT':
        return { class: 'INCOMPLETE_ARTIFACT', signal, details };

      default:
        // Exhaustive: all OutcomeClass variants covered
        return {
          class: 'NO_RESULT',
          signal: 'Unknown outcome class — falling back to NO_RESULT',
          details: { originalClass: error.class },
        };
    }
  }

  /**
   * @purpose Derive remediation from classified outcome: OK→proceed;
   * recoverable errors→continue; session errors→restart; unrecoverable→await_operator.
   * @param outcome The classified outcome.
   * @returns Remediation action for the recovery ladder.
   */
  remediate(outcome: ClassifiedOutcome): RemediationAction {
    switch (outcome.class) {
      case 'OK':
        return { action: 'proceed' };

      case 'NO_RESULT':
        return {
          action: 'continue',
          signal: outcome.signal,
          details: outcome.details,
        };

      case 'PARSE_ERROR':
        return {
          action: 'continue',
          signal: outcome.signal,
          details: outcome.details,
        };

      case 'SCHEMA_MISMATCH':
        return {
          action: 'continue',
          signal: outcome.signal,
          details: outcome.details,
        };

      case 'INCOMPLETE_ARTIFACT':
        return {
          action: 'continue',
          signal: outcome.signal,
          details: outcome.details,
        };

      case 'SESSION_ERROR':
        return {
          action: 'restart',
          signal: outcome.signal,
          details: outcome.details,
        };

      case 'TIMEOUT':
        return {
          action: 'restart',
          signal: outcome.signal,
          details: outcome.details,
        };

      default:
        return {
          action: 'await_operator',
          signal: 'Unhandled outcome class',
          details: { outcome },
        };
    }
  }
}
