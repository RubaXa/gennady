// @file: Canonical agent outcome classification and retry ladder for every runtime adapter.
// @consumers: AgentRuntimePort, inbox-roles
// @tasks: TSK-160, TSK-175

import type { OpenCodeCallResult, OutcomeClass } from './errors.ts';

/** @purpose Exhaustive classified runtime outcome consumed by retry policy. */
export type AgentClassifiedOutcome =
  | { class: 'OK'; output: Record<string, unknown> }
  | {
      class: Exclude<OutcomeClass, 'OK'>;
      signal: string;
      details?: Record<string, unknown>;
      raw?: string;
    };

/** @purpose Recovery action derived from one classified outcome. */
export type AgentRemediation =
  | { action: 'proceed' }
  | { action: 'continue'; signal: string; details?: Record<string, unknown> }
  | { action: 'restart'; signal: string; details?: Record<string, unknown> }
  | { action: 'await_operator'; signal: string; details?: Record<string, unknown> };

/**
 * @purpose Classify transport, parse, schema and task outcomes through one runtime-owned policy.
 * @invariant Raw invalid output remains attached to retryable failures.
 */
export class AgentOutcomeClassifier {
  /**
   * @purpose Convert one adapter result into the exhaustive runtime outcome vocabulary.
   * @param result Adapter result to classify.
   * @returns At most one classified variant with raw evidence retained.
   */
  classify(result: OpenCodeCallResult): AgentClassifiedOutcome {
    if (result.ok) return { class: 'OK', output: result.output };
    const outcome = result.error.class === 'OK' ? 'PARSE_ERROR' : result.error.class;
    return {
      class: outcome,
      signal: result.error.signal ?? `Agent runtime returned ${outcome}`,
      details: result.error.details,
      raw: result.error.raw,
    };
  }

  /**
   * @purpose Select continuation for correctable output and fresh run for lost runtime context.
   * @param outcome Classified runtime outcome.
   * @returns Existing recovery-ladder action without a parallel policy registry.
   */
  remediate(outcome: AgentClassifiedOutcome): AgentRemediation {
    if (outcome.class === 'OK') return { action: 'proceed' };
    if (outcome.class === 'SESSION_ERROR' || outcome.class === 'TIMEOUT') {
      return { action: 'restart', signal: outcome.signal, details: outcome.details };
    }
    return { action: 'continue', signal: outcome.signal, details: outcome.details };
  }
}

/** @purpose Recovery action after classifying a prompt outcome. */
export type LadderAction = 'continue' | 'restart' | 'accept';

/**
 * @purpose Classify a prompt result for the legacy recovery-ladder consumer.
 * @param result Adapter result to classify.
 * @returns Existing exhaustive outcome-class discriminator.
 */
export function classifyOutcome(result: OpenCodeCallResult): OutcomeClass {
  return result.ok ? 'OK' : result.error.class;
}

/**
 * @purpose Preserve the existing bounded continuation/restart ladder without duplicating policy.
 * @invariant First failure continues; second starts fresh; third is terminal for the caller.
 * @param previousFailures Consecutive failures preceding the current result.
 * @param currentOutcome Current classified outcome.
 * @returns Bounded recovery action.
 */
export function resolveOutcomeLadder(
  previousFailures: number,
  currentOutcome: OutcomeClass
): LadderAction {
  if (currentOutcome === 'OK') return 'accept';
  const attempt = previousFailures + 1;
  if (attempt === 1) return 'continue';
  if (attempt === 2) return 'restart';
  return 'accept';
}
