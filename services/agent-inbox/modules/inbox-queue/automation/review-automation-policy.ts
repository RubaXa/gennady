// @file: ReviewAutomationPolicy — resolves only proven prior-operator-intent restoration; no speculative automation.
// @consumers: ReviewActionCatalog, ReviewEffectCoordinator
// @tasks: TSK-177

import { logger } from '#logger';
import type { VcsEffectKind } from '../types/review-effect.type.ts';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';

/**
 * @purpose Evidence of a prior operator approval used for restore-approve automation.
 */
export type PriorApprovalEvidence = Readonly<{
  /** @purpose ISO timestamp of the prior approval */
  approvedAt: string;
  /** @purpose Manifest key (mr, headSHA, cursor) from the prior approval round */
  manifestRef: string;
  /** @purpose Operator login who approved */
  operatorLogin: string;
}>;

/**
 * @purpose Evidence of a verified fix resolution for auto-resolve.
 */
export type VerifiedFixEvidence = Readonly<{
  /** @purpose Discussion/thread ID that was resolved */
  discussionId: string;
  /** @purpose Owner of the thread (operator or allowlisted bot) */
  threadOwner: string;
  /** @purpose Whether the thread owner is in the allowlist */
  ownerAllowlisted: boolean;
  /** @purpose The fix verification proof reference */
  verificationRef: string;
}>;

/**
 * @purpose Automation gate result — either passes with justification or falls back to proposal.
 */
export type AutomationGateResult =
  | { allowed: true; justification: string }
  | { allowed: false; reason: string; fallback: 'proposal' | 'no-action' };

/**
 * @purpose Configuration for the automation policy evaluation.
 */
export type AutomationPolicyConfig = Readonly<{
  /** @purpose Usernames of operators allowed to have threads auto-resolved */
  operatorAllowlist: readonly string[];
  /** @purpose Bot usernames whose threads are eligible for auto-resolve on owned MRs */
  botAllowlist: readonly string[];
  /** @purpose Whether coverage must be fresh-PASS before restore-approve */
  requireFreshCoverage: boolean;
}>;

/**
 * @purpose Evaluates automation gates — only restores proven prior operator intent; no speculative promotion.
 * @invariant Stateless; missing evidence always produces proposal/no-action, never unsafe automation.
 * @invariant Auto-resolve: verified fix + thread in operator/bot allowlist; auto-approve: fresh PASS + no blocking finding + prior approval.
 * @invariant Automation never constructs operator-independent effects; provenance is immutable.
 */
export class ReviewAutomationPolicy {
  /** @purpose Policy configuration. */
  protected _config: AutomationPolicyConfig;

  /**
   * @purpose Create the automation policy with the given configuration.
   * @param config Operator allowlist, bot allowlist, and coverage requirement.
   */
  constructor(config: AutomationPolicyConfig) {
    this._config = config;
    logger.debug('[ReviewAutomationPolicy#constructor] [init → ready]', {
      operatorAllowlist: config.operatorAllowlist.length,
      botAllowlist: config.botAllowlist.length,
    });
  }

  /**
   * @purpose Evaluate whether an auto-resolve is permitted.
   * @invariant Requires verified fix evidence and allowlisted thread owner.
   * @param kind Action kind — must be resolve.
   * @param fixEvidence Verified fix proof.
   * @param isOwnMr Whether the MR is authored by the operator.
   * @returns Gate result — allowed with justification or denied with fallback.
   */
  evaluateAutoResolve(
    kind: VcsEffectKind,
    fixEvidence: VerifiedFixEvidence,
    isOwnMr: boolean
  ): AutomationGateResult {
    if (kind !== 'resolve') {
      return {
        allowed: false,
        reason: `auto-resolve only applies to resolve action; got ${kind}`,
        fallback: 'proposal',
      };
    }

    // #region START_AUTO_RESOLVE_GATES — allowlist check for operator or bot threads
    const operatorOwned = this._config.operatorAllowlist.includes(fixEvidence.threadOwner);
    const botOnOwnMr = isOwnMr && this._config.botAllowlist.includes(fixEvidence.threadOwner);

    if (!operatorOwned && !botOnOwnMr) {
      return {
        allowed: false,
        reason: `Thread owner ${fixEvidence.threadOwner} not in allowlist; isOwnMr=${isOwnMr}`,
        fallback: 'proposal',
      };
    }

    if (!fixEvidence.verificationRef) {
      return { allowed: false, reason: 'Missing fix verification proof', fallback: 'proposal' };
    }
    // #endregion END_AUTO_RESOLVE_GATES

    const justification = `auto-resolve: owner=${fixEvidence.threadOwner} verified=${fixEvidence.verificationRef}`;
    logger.debug(`[ReviewAutomationPolicy#autoResolve] [evaluation → allowed] ${justification}`);
    return { allowed: true, justification };
  }

  /**
   * @purpose Evaluate whether a restore-approve automation is permitted.
   * @invariant Requires prior approval evidence + fresh coverage PASS + no blocking finding.
   * @param kind Action kind — must be approve.
   * @param guardedIntent Current guarded intent (for coverage check reference).
   * @param priorApproval Evidence of a prior approval by the same operator.
   * @param hasBlockingFinding Whether a blocking finding is present in the current round.
   * @returns Gate result — allowed with justification or denied with fallback.
   */
  evaluateRestoreApprove(
    kind: VcsEffectKind,
    guardedIntent: ReviewGuardedIntent,
    priorApproval: PriorApprovalEvidence | undefined,
    hasBlockingFinding: boolean
  ): AutomationGateResult {
    if (kind !== 'approve') {
      return {
        allowed: false,
        reason: `restore-approve only applies to approve action; got ${kind}`,
        fallback: 'proposal',
      };
    }

    // #region START_RESTORE_APPROVE_GATES — all three gates must pass
    if (!priorApproval) {
      return { allowed: false, reason: 'No prior approval evidence found', fallback: 'proposal' };
    }

    if (hasBlockingFinding) {
      return {
        allowed: false,
        reason: 'Blocking finding present in current round',
        fallback: 'proposal',
      };
    }

    if (this._config.requireFreshCoverage) {
      const handoff = guardedIntent.handoff;
      if (handoff.deliveryStatus !== 'ACCEPTED') {
        return {
          allowed: false,
          reason: 'Fresh coverage PASS required for restore-approve',
          fallback: 'proposal',
        };
      }
    }
    // #endregion END_RESTORE_APPROVE_GATES

    const justification = `restore-approve: prior=${priorApproval.approvedAt} operator=${priorApproval.operatorLogin} guardId=${guardedIntent.guardId}`;
    logger.debug(`[ReviewAutomationPolicy#restoreApprove] [evaluation → allowed] ${justification}`);
    return { allowed: true, justification };
  }

  /**
   * @purpose Evaluate automation for a general kind — dispatches to the appropriate gate.
   * @param kind Action kind to evaluate.
   * @param guardedIntent Current guarded intent.
   * @param context Evaluation context with fix/approval evidence.
   * @returns Gate result.
   */
  evaluate(
    kind: VcsEffectKind,
    guardedIntent: ReviewGuardedIntent,
    context: {
      fixEvidence?: VerifiedFixEvidence;
      priorApproval?: PriorApprovalEvidence;
      isOwnMr?: boolean;
      hasBlockingFinding?: boolean;
    }
  ): AutomationGateResult {
    switch (kind) {
      case 'resolve':
        if (!context.fixEvidence) {
          return {
            allowed: false,
            reason: 'No fix evidence provided for auto-resolve',
            fallback: 'proposal',
          };
        }
        return this.evaluateAutoResolve(kind, context.fixEvidence, context.isOwnMr ?? false);

      case 'approve':
        return this.evaluateRestoreApprove(
          kind,
          guardedIntent,
          context.priorApproval,
          context.hasBlockingFinding ?? false
        );

      default:
        return {
          allowed: false,
          reason: `No automation policy for kind=${kind}`,
          fallback: 'no-action',
        };
    }
  }
}
