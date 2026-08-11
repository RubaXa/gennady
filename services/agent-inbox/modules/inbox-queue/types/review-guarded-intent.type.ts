// @file: ReviewGuardedIntent value object — exact immutable pipeline handoff byte-equivalent and downstream dispatch guard.
// @consumers: ReviewProposal, ReviewActionPackage, ReviewDecision, ReviewEffect, ReviewEffectCoordinator
// @tasks: TSK-177

import type {
  ReviewPublicationHandoff,
  ReviewDispatchPolicy,
  ReviewCapabilitySnapshot,
} from '../../inbox-pipeline/types/review-publication-handoff.type.ts';
import type { ReviewManifestKey } from '../../inbox-pipeline/types/review-intent.type.ts';
import { constructReviewPublicationHandoff } from '../../inbox-pipeline/types/review-publication-handoff.type.ts';

export type { ReviewPublicationHandoff, ReviewDispatchPolicy, ReviewCapabilitySnapshot };

/**
 * @purpose Immutable value object carrying the exact accepted pipeline handoff and a stable guard ID for downstream reference.
 * @invariant Exact byte-equivalent of the accepted ReviewPublicationHandoff — no translation, defaulting or field rename.
 * @invariant guardId is derived deterministically from handoffId; downstream entities reference it by value.
 * @invariant Live capability recheck creates a separate dispatch observation and never mutates the stored record.
 */
export type ReviewGuardedIntent = Readonly<{
  /** @purpose Stable derived guard identity for downstream proposal/effect/outcome references | @invariant Equals handoff.handoffId */
  guardId: string;
  /** @purpose Exact accepted pipeline handoff record — stored byte-equivalent, no re-serialization */
  handoff: ReviewPublicationHandoff;
  /** @purpose ISO timestamp when queue accepted this handoff */
  acceptedAt: string;
}>;

/**
 * @purpose Accept a fresh pipeline handoff, validate exact schema, and produce a stable guarded intent.
 * @invariant Fails closed on any missing, extra, renamed, defaulted field or non-PASS deliveryStatus.
 * @param handoff Candidate pipeline handoff.
 * @param acceptedAt ISO timestamp of acceptance.
 * @throws {Error} When the handoff is not byte-equivalent ACCEPTED schema.
 * @returns Immutable guarded intent referencing the exact record.
 */
export function constructReviewGuardedIntent(
  handoff: ReviewPublicationHandoff,
  acceptedAt: string
): ReviewGuardedIntent {
  const validated = constructReviewPublicationHandoff(handoff);
  return Object.freeze({
    guardId: validated.handoffId,
    handoff: validated,
    acceptedAt,
  });
}

/**
 * @purpose Extract the manifest key from a guarded intent for freshness comparison.
 * @param intent Guarded intent to inspect.
 * @returns Immutable manifest key from the accepted handoff.
 */
export function guardedManifestKey(intent: ReviewGuardedIntent): ReviewManifestKey {
  return intent.handoff.manifestKey;
}

/**
 * @purpose Extract the dispatch policy from a guarded intent for pre-effect gate resolution.
 * @param intent Guarded intent to inspect.
 * @returns Dispatch policy from the accepted handoff.
 */
export function guardedDispatchPolicy(intent: ReviewGuardedIntent): ReviewDispatchPolicy {
  return intent.handoff.dispatchPolicy;
}
