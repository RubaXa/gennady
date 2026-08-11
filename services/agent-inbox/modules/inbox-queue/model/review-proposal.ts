// @file: ReviewProposal entity — one candidate operator or automatic action derived from an accepted guarded handoff.
// @consumers: ReviewActionPackage, ReviewDecision
// @tasks: TSK-177

import { logger } from '#logger';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';
import type { VcsEffectKind } from '../types/review-effect.type.ts';

/**
 * @purpose Closed proposal lifecycle states.
 * @invariant pending → selected | deselected | invalidated; invalidated is terminal per this intent version.
 */
export type ReviewProposalStatus = 'pending' | 'selected' | 'deselected' | 'invalidated';

/**
 * @purpose Action mode — whether the action is performed manually or automatically.
 */
export type ReviewActionMode = 'manual' | 'automatic';

/**
 * @purpose Evidence of why an action is unavailable.
 */
export type ReviewUnavailableEvidence = Readonly<{
  /** @purpose Closed reason for unavailability */
  reason: 'unsupported_capability' | 'missing_permission' | 'missing_allowlist' | 'stale_target';
  /** @purpose Human-readable explanation retained for dashboard display */
  detail: string;
}>;

/**
 * @purpose One candidate manual or automatic action derived from a single accepted guarded handoff.
 * @invariant Immutable revisions; stale guarded intent prevents effect derivation but remains observable.
 * @invariant Proposals in the same alternativeGroup are mutually exclusive — at most one may be selected.
 * @invariant defaultSelected=true means this proposal is pre-selected when the package is built.
 */
export type ReviewProposal = {
  /** @purpose Stable proposal identifier | @invariant Format: proposal:<guardId>:<actionKind>:<seq> */
  proposalId: string;
  /** @purpose Guard this proposal is bound to — stale guard prevents effect derivation */
  guardedIntent: ReviewGuardedIntent;
  /** @purpose Closed action kind this proposal maps to */
  actionKind: VcsEffectKind;
  /** @purpose Mode this proposal was created for */
  mode: ReviewActionMode;
  /** @purpose Normalized action payload (body, discussionId, etc.) */
  payload: Readonly<Record<string, string>>;
  /** @purpose Proposal IDs that must be applied before this one | @invariant empty = no dependencies */
  dependsOn: readonly string[];
  /** @purpose Alternative group identifier — proposals with same group are mutually exclusive | @invariant absent = independent */
  alternativeGroup?: string;
  /** @purpose Whether this proposal is pre-selected as the recommendation */
  defaultSelected: boolean;
  /** @purpose Operator-visible rationale for this action */
  rationale: string;
  /** @purpose Whether this action is available | @invariant false = unavailableEvidence is populated */
  available: boolean;
  /** @purpose Evidence of unavailability | @invariant absent when available=true */
  unavailableEvidence?: ReviewUnavailableEvidence;
  /** @purpose Current lifecycle status */
  status: ReviewProposalStatus;
  /** @purpose ISO timestamp of proposal creation */
  createdAt: string;
};

/**
 * @purpose Invalidate a proposal when its guarded intent becomes stale — retains the record for observability.
 * @invariant Stale intent prevents effect derivation; package and selections remain queryable.
 * @param proposal Mutable proposal to invalidate.
 * @param reason Short explanation of the invalidation cause.
 */
export function invalidateReviewProposal(proposal: ReviewProposal, reason: string): void {
  const prev = proposal.status;
  (proposal as { status: ReviewProposalStatus }).status = 'invalidated';
  logger.info(
    `[ReviewProposal#invalidate] [${prev} → invalidated] proposalId=${proposal.proposalId} reason=${reason}`
  );
}

/**
 * @purpose Select a proposal — marks it as the chosen action.
 * @invariant Throws when the proposal is invalidated or unavailable.
 * @param proposal Mutable proposal to select.
 * @throws {Error} When the proposal is not available or already invalidated.
 */
export function selectReviewProposal(proposal: ReviewProposal): void {
  if (proposal.status === 'invalidated') {
    throw new Error(
      `[selectReviewProposal] Cannot select invalidated proposal: ${proposal.proposalId}`
    );
  }
  if (!proposal.available) {
    throw new Error(
      `[selectReviewProposal] Cannot select unavailable proposal: ${proposal.proposalId}`
    );
  }
  (proposal as { status: ReviewProposalStatus }).status = 'selected';
  logger.debug(`[ReviewProposal#select] [pending → selected] proposalId=${proposal.proposalId}`);
}

/**
 * @purpose Construct a new ReviewProposal with validated fields.
 * @param fields All proposal fields except status (defaults to pending).
 * @throws {Error} When proposalId, actionKind, or guardedIntent are absent.
 * @returns Mutable proposal.
 */
export function constructReviewProposal(
  fields: Omit<ReviewProposal, 'status'> & { status?: ReviewProposalStatus }
): ReviewProposal {
  if (!fields.proposalId || !fields.actionKind || !fields.guardedIntent) {
    throw new Error(
      '[constructReviewProposal] proposalId, actionKind, and guardedIntent are required'
    );
  }
  return {
    ...fields,
    status: fields.status ?? 'pending',
    dependsOn: fields.dependsOn ?? [],
  };
}
