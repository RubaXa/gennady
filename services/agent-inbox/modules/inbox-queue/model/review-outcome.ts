// @file: ReviewOutcome entity — reconciled classification of one effect with applied|not-applied|ambiguous status.
// @consumers: ReviewEffectQueue, ReviewActionPackage
// @tasks: TSK-177

import { logger } from '#logger';
import type { ReviewEffectIdentity } from '../types/review-effect.type.ts';

/**
 * @purpose Closed reconciliation outcome — exactly three values, no fourth.
 * @invariant transport success, timeout, and exception are not outcomes; they map to ambiguous.
 * @invariant ambiguous never triggers blind retry.
 */
export type ReviewOutcomeStatus = 'applied' | 'not-applied' | 'ambiguous';

/**
 * @purpose Retry eligibility record — only provable not-applied justifies retry.
 */
export type ReviewRetryEligibility = Readonly<{
  /** @purpose Whether a retry is allowed */
  eligible: boolean;
  /** @purpose Reason for ineligibility | @invariant absent when eligible=true */
  reason?: string;
}>;

/**
 * @purpose Confirmed reconciliation classification of one effect.
 * @invariant Immutable revisions; each external-write-started effect must receive one outcome.
 * @invariant ambiguous outcome requires operator/new observation decision — automatic retry is forbidden.
 * @invariant Transport success alone is not applied; provider/readback evidence is required.
 */
export type ReviewOutcome = Readonly<{
  /** @purpose Stable outcome identifier | @invariant Format: outcome:<effectId>:<attemptCount> */
  outcomeId: string;
  /** @purpose Effect identifier this outcome is for */
  effectId: string;
  /** @purpose Discriminated identity binding (preserved from effect) */
  effectIdentity: ReviewEffectIdentity;
  /** @purpose MR reference */
  mr: string;
  /** @purpose Reconciliation status */
  status: ReviewOutcomeStatus;
  /** @purpose Provider response evidence | @invariant non-empty string; never empty on applied/not-applied */
  evidence: string;
  /** @purpose Read-after-effect observation identity when available */
  readAfterEffectRef?: string;
  /** @purpose Read-after-effect revision when available */
  readAfterEffectRevision?: string;
  /** @purpose Number of dispatch attempts that led to this outcome */
  attemptCount: number;
  /** @purpose Retry eligibility computed from status */
  retryEligibility: ReviewRetryEligibility;
  /** @purpose ISO timestamp of outcome recording */
  recordedAt: string;
}>;

/**
 * @purpose Compute retry eligibility from a reconciliation status.
 * @invariant Only not-applied with same idempotency/guard identity may retry; ambiguous never retries blindly.
 * @param status Outcome status.
 * @returns Retry eligibility.
 */
export function computeRetryEligibility(status: ReviewOutcomeStatus): ReviewRetryEligibility {
  switch (status) {
    case 'not-applied':
      return Object.freeze({ eligible: true });
    case 'applied':
      return Object.freeze({ eligible: false, reason: 'already applied' });
    case 'ambiguous':
      return Object.freeze({
        eligible: false,
        reason: 'ambiguous outcome requires operator decision',
      });
  }
}

/**
 * @purpose Construct a ReviewOutcome and log the classification.
 * @param fields All outcome fields except retryEligibility (computed from status).
 * @throws {Error} When outcomeId, effectId, or evidence are absent.
 * @returns Immutable outcome.
 */
export function constructReviewOutcome(
  fields: Omit<ReviewOutcome, 'retryEligibility'>
): ReviewOutcome {
  if (!fields.outcomeId || !fields.effectId || !fields.evidence) {
    throw new Error('[constructReviewOutcome] outcomeId, effectId, and evidence are required');
  }
  const retryEligibility = computeRetryEligibility(fields.status);
  logger.info(
    `[ReviewOutcome#construct] [reconciled] effectId=${fields.effectId} status=${fields.status} retry=${retryEligibility.eligible}`
  );
  return Object.freeze({ ...fields, retryEligibility });
}
