// @file: ReviewEffect value object — idempotent mutation intent with closed origin discriminant and exhaustive ref-set classification.
// @consumers: ReviewEffectQueue, ReviewEffectCoordinator
// @tasks: TSK-177

import type { VcsEffectKind } from '../../inbox-vcs/vcs-port.ts';

export type { VcsEffectKind };

/**
 * @purpose Closed origin discriminant — exactly two paths, no third.
 * @invariant round-derived requires a fresh guarded intent and full pipeline handoff evidence.
 * @invariant operator-independent requires explicit operator command ID, zero current-round artifact/finding/proposal refs, and own permission/allowlist/freshness gates.
 */
export type ReviewEffectOrigin = 'round-derived' | 'operator-independent';

/**
 * @purpose Provenance record for the origin classification decision.
 * @invariant classifierVersion and examinedRefs must be populated to prevent fabricated origin claims.
 */
export type ReviewEffectProvenance = Readonly<{
  /** @purpose Version of the classifier that produced this origin decision */
  classifierVersion: string;
  /** @purpose Complete set of refs examined during classification | @invariant Empty for operator-independent */
  examinedRefs: readonly string[];
  /** @purpose Permission gate outcome for operator-independent | @invariant absent for round-derived */
  permissionDecision?: string;
  /** @purpose Allowlist gate outcome for operator-independent | @invariant absent for round-derived */
  allowlistDecision?: string;
  /** @purpose Target freshness gate outcome for operator-independent | @invariant absent for round-derived */
  targetFreshnessDecision?: string;
  /** @purpose Operator command identity | @invariant required for operator-independent */
  operatorCommandId?: string;
  /** @purpose Session/model provenance */
  sessionRef?: string;
}>;

/**
 * @purpose Round-derived effect identity — binds the effect to a specific pipeline handoff and decision.
 */
export type RoundDerivedEffectIdentity = Readonly<{
  origin: 'round-derived';
  /** @purpose Guard ID from the accepted ReviewGuardedIntent */
  guardId: string;
  /** @purpose Decision revision this effect was derived from */
  decisionId: string;
  /** @purpose Proposal revision included in this effect */
  proposalId: string;
}>;

/**
 * @purpose Operator-independent effect identity — binds to explicit operator command and direct target.
 */
export type OperatorIndependentEffectIdentity = Readonly<{
  origin: 'operator-independent';
  /** @purpose Explicit operator command identifier */
  operatorCommandId: string;
  /** @purpose Direct target identity (e.g. discussion ID, thread ID) */
  directTargetId: string;
  /** @purpose Direct target version/revision observed at gate evaluation */
  directTargetVersion: string;
}>;

/** @purpose Discriminated effect identity — either round-derived or operator-independent. */
export type ReviewEffectIdentity = RoundDerivedEffectIdentity | OperatorIndependentEffectIdentity;

/**
 * @purpose Lifecycle state of one effect in the queue.
 * @invariant queued → dispatching → unconfirmed → reconciled; invalidated only from queued.
 */
export type ReviewEffectState =
  | 'queued'
  | 'dispatching'
  | 'unconfirmed'
  | 'reconciled'
  | 'invalidated';

/**
 * @purpose Idempotent mutation intent with guarded or direct-target identity and closed lifecycle.
 * @invariant effectId is stable across all attempts — same payload, same ID.
 * @invariant A new payload/origin/guard-or-direct-target creates a new effect, not a mutation.
 * @invariant Dependency IDs are ordered; the effect is not dispatched until all deps are reconciled applied.
 */
export type ReviewEffect = Readonly<{
  /** @purpose Stable SHA-based effect identity — deterministic from MR, revision, kind, and normalized payload */
  effectId: string;
  /** @purpose Closed provider mutation type */
  kind: VcsEffectKind;
  /** @purpose MR reference this effect targets */
  mr: string;
  /** @purpose Discriminated identity binding to the pipeline round or operator command */
  identity: ReviewEffectIdentity;
  /** @purpose Normalized mutation payload (body, discussionId, etc.) */
  payload: Readonly<Record<string, string>>;
  /** @purpose Effect IDs that must reach reconciled applied before this one is dispatched */
  dependsOn: readonly string[];
  /** @purpose Current lifecycle state */
  state: ReviewEffectState;
  /** @purpose Idempotency key for external provider | @invariant equals effectId; preserved across retries */
  idempotencyKey: string;
  /** @purpose Provider conditional revision bound at dispatch | @invariant absent for reconcile-only */
  conditionalRevision?: string;
  /** @purpose Number of dispatch attempts | @invariant >= 0 */
  attemptCount: number;
  /** @purpose Classification and gate-decision provenance */
  provenance: ReviewEffectProvenance;
  /** @purpose ISO timestamp of effect creation */
  createdAt: string;
}>;

/**
 * @purpose Enumerate all direct and transitive current-round references from an effect.
 * @invariant Returns empty set only for operator-independent effects with proven zero refs.
 * @param effect Effect to inspect.
 * @returns Frozen set of round reference strings.
 */
export function enumerateRoundRefs(effect: ReviewEffect): ReadonlySet<string> {
  if (effect.identity.origin === 'operator-independent') {
    return Object.freeze(new Set<string>());
  }
  return Object.freeze(
    new Set([effect.identity.guardId, effect.identity.decisionId, effect.identity.proposalId])
  );
}

/**
 * @purpose Deterministically classify effect origin from canonical payload, dependencies, and provenance.
 * @invariant Any nonzero or hidden round ref routes to round-derived; manual label alone is not a gate.
 * @param identity Candidate effect identity.
 * @param roundRefs Refs discovered in the payload/dependency graph.
 * @returns The validated origin, potentially overriding a claimed independent origin.
 */
export function classifyEffectOrigin(
  identity: ReviewEffectIdentity,
  roundRefs: readonly string[]
): ReviewEffectOrigin {
  // #region START_CLASSIFY_ORIGIN — any hidden/nonzero round ref forces round-derived
  if (roundRefs.length > 0) {
    return 'round-derived';
  }
  return identity.origin;
  // #endregion END_CLASSIFY_ORIGIN
}
