// @file: ReviewDecision entity — operator selection/edit/rejection or proven automatic restoration intent.
// @consumers: ReviewEffectQueue, ReviewEffectCoordinator
// @tasks: TSK-177

import { logger } from '#logger';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';
import type { ReviewActionMode } from './review-proposal.ts';

/**
 * @purpose Actor type for a decision — operator or automation.
 * @invariant automation actor requires prior-approval evidence; never conjured without proof.
 */
export type ReviewDecisionActor = 'operator' | 'automation';

/**
 * @purpose Immutable record of an operator or automatic decision on a package of proposals.
 * @invariant One decision revision per apply attempt; immutable after creation.
 * @invariant Invalid selections (unknown proposalIds, alternative group violations) produce no effects.
 */
export type ReviewDecision = Readonly<{
  /** @purpose Stable decision identifier | @invariant Format: decision:<packageId>:<seq> */
  decisionId: string;
  /** @purpose Package ID this decision applies to */
  packageId: string;
  /** @purpose Guard this decision is bound to */
  guardedIntent: ReviewGuardedIntent;
  /** @purpose Proposal IDs that have been selected for execution */
  selectedProposalIds: readonly string[];
  /** @purpose Proposal IDs that have been explicitly rejected */
  rejectedProposalIds: readonly string[];
  /** @purpose Actor making the decision */
  actor: ReviewDecisionActor;
  /** @purpose Mode — manual selection or automatic restoration */
  mode: ReviewActionMode;
  /** @purpose Operator-supplied or automation-generated reason for the decision */
  reason: string;
  /** @purpose ISO timestamp of the decision */
  decidedAt: string;
}>;

/**
 * @purpose Validate that a decision's selected proposals are coherent within the package.
 * @invariant Mutually exclusive alternatives cannot both be selected.
 * @invariant Only known proposalIds may appear in selectedProposalIds.
 * @param decision Decision to validate.
 * @param availableProposalIds Set of proposal IDs in this package.
 * @param alternativeGroups Map from proposalId to its alternative group (if any).
 * @returns Validation result with reason on failure.
 */
export function validateReviewDecision(
  decision: ReviewDecision,
  availableProposalIds: ReadonlySet<string>,
  alternativeGroups: ReadonlyMap<string, string>
): { valid: true } | { valid: false; reason: string } {
  // #region START_VALIDATE_KNOWN_PROPOSALS — reject unknown proposal IDs before effect derivation
  for (const id of decision.selectedProposalIds) {
    if (!availableProposalIds.has(id)) {
      return { valid: false, reason: `Unknown proposalId: ${id}` };
    }
  }
  // #endregion END_VALIDATE_KNOWN_PROPOSALS

  // #region START_VALIDATE_ALTERNATIVES — mutually exclusive alternatives cannot co-execute
  const selectedGroups = new Map<string, string>();
  for (const id of decision.selectedProposalIds) {
    const group = alternativeGroups.get(id);
    if (!group) continue;
    const prior = selectedGroups.get(group);
    if (prior) {
      return {
        valid: false,
        reason: `Alternative group conflict: ${id} and ${prior} both selected in group ${group}`,
      };
    }
    selectedGroups.set(group, id);
  }
  // #endregion END_VALIDATE_ALTERNATIVES

  logger.debug(
    `[validateReviewDecision] [validation → valid] decisionId=${decision.decisionId} selected=${decision.selectedProposalIds.length}`
  );
  return { valid: true };
}

/**
 * @purpose Construct a new ReviewDecision with validated required fields.
 * @param fields All decision fields.
 * @throws {Error} When decisionId, packageId, or guardedIntent are absent.
 * @returns Immutable decision.
 */
export function constructReviewDecision(fields: ReviewDecision): ReviewDecision {
  if (!fields.decisionId || !fields.packageId || !fields.guardedIntent) {
    throw new Error(
      '[constructReviewDecision] decisionId, packageId, and guardedIntent are required'
    );
  }
  return Object.freeze({
    ...fields,
    selectedProposalIds: Object.freeze([...fields.selectedProposalIds]),
    rejectedProposalIds: Object.freeze([...fields.rejectedProposalIds]),
  });
}
