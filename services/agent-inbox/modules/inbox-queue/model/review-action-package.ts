// @file: ReviewActionPackage entity — coherent UI/state unit of independent proposals, alternatives, and ordered dependencies.
// @consumers: ReviewDecision, ReviewEffectQueue
// @tasks: TSK-177

import { logger } from '#logger';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';
import type { ReviewProposal } from './review-proposal.ts';
import type { ReviewOutcome } from './review-outcome.ts';

/**
 * @purpose Closed package lifecycle states.
 * @invariant active → stale (new MR event) | completed (all effects reconciled).
 * @invariant Stale packages are visible but apply is rejected; package data and outcomes remain queryable.
 */
export type ReviewPackageStatus = 'active' | 'stale' | 'completed';

/**
 * @purpose Per-action outcome attachment for package projection.
 */
export type ReviewPackageActionOutcome = Readonly<{
  /** @purpose Proposal this outcome is attached to */
  proposalId: string;
  /** @purpose Effect ID produced from this proposal */
  effectId: string;
  /** @purpose Outcome when reconciled | @invariant absent while effect is still in flight */
  outcome?: ReviewOutcome;
}>;

/**
 * @purpose Coherent operator-facing package — one per accepted guarded handoff/round.
 * @invariant One package per accepted handoff/round; new MR state makes queued/not-yet-written remainder stale.
 * @invariant Recommendations are pre-selected; mutually exclusive choices cannot co-execute.
 * @invariant Package, selections, outcomes, and reasons remain observable even when stale.
 * @invariant New observed MR state invalidates only queued intents; dispatching/unconfirmed effects continue.
 */
export type ReviewActionPackage = {
  /** @purpose Stable package identifier */
  packageId: string;
  /** @purpose Monotonic revision number | @invariant increments on each selection change */
  revision: number;
  /** @purpose Guard this package is bound to */
  guardedIntent: ReviewGuardedIntent;
  /** @purpose All proposals in this package — independent, alternative groups, and dependent */
  proposals: ReviewProposal[];
  /** @purpose Currently selected proposal IDs */
  selectedProposalIds: string[];
  /** @purpose Current package lifecycle status */
  status: ReviewPackageStatus;
  /** @purpose Stale reason when status=stale | @invariant Populated with the new event cursor that caused staleness */
  staleReason?: string;
  /** @purpose Stale revision reference for replacement lookup */
  stalePriorRevision?: number;
  /** @purpose Per-proposal outcome attachments for projection */
  actionOutcomes: ReviewPackageActionOutcome[];
  /** @purpose ISO timestamp of package creation */
  createdAt: string;
  /** @purpose ISO timestamp of last status change */
  updatedAt: string;
};

/**
 * @purpose Mark a package as stale — retains data, disables new apply.
 * @invariant Only queued/not-yet-dispatched intents are stale; dispatching/unconfirmed effects are not affected by this call.
 * @param pkg Mutable package to stale.
 * @param reason Cursor or event reference that caused staleness.
 */
export function staleReviewActionPackage(pkg: ReviewActionPackage, reason: string): void {
  const prev = pkg.status;
  if (prev === 'stale' || prev === 'completed') {
    logger.debug(
      `[ReviewActionPackage#stale] [skip → already_terminal] packageId=${pkg.packageId} status=${prev}`
    );
    return;
  }
  pkg.staleReason = reason;
  pkg.stalePriorRevision = pkg.revision;
  pkg.status = 'stale';
  pkg.updatedAt = new Date().toISOString();
  logger.info(
    `[ReviewActionPackage#stale] [${prev} → stale] packageId=${pkg.packageId} reason=${reason}`
  );
}

/**
 * @purpose Attach a per-action outcome to the package projection.
 * @param pkg Mutable package.
 * @param proposalId Proposal this outcome is for.
 * @param effectId Effect ID produced.
 * @param [outcome] Reconciled outcome or undefined when still in flight.
 */
export function attachPackageOutcome(
  pkg: ReviewActionPackage,
  proposalId: string,
  effectId: string,
  outcome?: ReviewOutcome
): void {
  const existing = pkg.actionOutcomes.find((ao) => ao.proposalId === proposalId);
  if (existing) {
    (existing as { outcome?: ReviewOutcome }).outcome = outcome;
    (existing as { effectId: string }).effectId = effectId;
  } else {
    pkg.actionOutcomes.push(Object.freeze({ proposalId, effectId, outcome }));
  }
  pkg.updatedAt = new Date().toISOString();
}

/**
 * @purpose Construct a new ReviewActionPackage with defaults applied.
 * @param fields Package fields (status defaults to active, revision to 1).
 * @throws {Error} When packageId or guardedIntent are absent.
 * @returns Mutable package.
 */
export function constructReviewActionPackage(
  fields: Omit<
    ReviewActionPackage,
    'revision' | 'status' | 'selectedProposalIds' | 'actionOutcomes' | 'updatedAt'
  > &
    Partial<
      Pick<
        ReviewActionPackage,
        'revision' | 'status' | 'selectedProposalIds' | 'actionOutcomes' | 'updatedAt'
      >
    >
): ReviewActionPackage {
  if (!fields.packageId || !fields.guardedIntent) {
    throw new Error('[constructReviewActionPackage] packageId and guardedIntent are required');
  }
  const now = new Date().toISOString();
  return {
    ...fields,
    revision: fields.revision ?? 1,
    status: fields.status ?? 'active',
    selectedProposalIds:
      fields.selectedProposalIds ??
      fields.proposals.filter((p) => p.defaultSelected && p.available).map((p) => p.proposalId),
    actionOutcomes: fields.actionOutcomes ?? [],
    updatedAt: fields.updatedAt ?? now,
  };
}
