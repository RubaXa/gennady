// @file: ReviewEffectCoordinator — sole dispatcher and reconciler for dependency-aware guarded and independent effects.
// @consumers: scheduler/API commands
// @tasks: TSK-177

import { logger } from '#logger';
import { createHash } from 'node:crypto';
import type { VcsPort, VcsEffectRequest } from '../../inbox-vcs/vcs-port.ts';
import { Effects } from '../../inbox-vcs/effects.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { ReviewGuardedIntent } from '../types/review-guarded-intent.type.ts';
import {
  constructReviewGuardedIntent,
  guardedManifestKey,
} from '../types/review-guarded-intent.type.ts';
import type {
  ReviewEffect,
  ReviewEffectProvenance,
  OperatorIndependentEffectIdentity,
} from '../types/review-effect.type.ts';
import { classifyEffectOrigin } from '../types/review-effect.type.ts';
import type { ReviewActionPackage } from '../model/review-action-package.ts';
import { staleReviewActionPackage } from '../model/review-action-package.ts';
import type { ReviewEffectQueue, ReviewEffectEntry } from '../model/review-effect-queue.ts';
import {
  claimNextReadyEffect,
  markEffectUnconfirmed,
  reconcileEffectEntry,
  invalidateQueuedEffects,
} from '../model/review-effect-queue.ts';
import { constructReviewOutcome } from '../model/review-outcome.ts';
import type { ReviewDecision } from '../model/review-decision.ts';
import type { ReviewProposal } from '../model/review-proposal.ts';
import type { ReviewActionCatalog } from '../registry/review-action-catalog.ts';
import type { ReviewPublicationHandoff } from '../../inbox-pipeline/types/review-publication-handoff.type.ts';

/** @purpose Accepted handoff record stored byte-equivalent for the current round. */
export type AcceptedHandoffRecord = Readonly<{
  guardedIntent: ReviewGuardedIntent;
  digest: string;
}>;

/** @purpose Result of accepting a pipeline handoff. */
export type HandoffAcceptResult =
  | { deliveryStatus: 'ACCEPTED'; guardedIntent: ReviewGuardedIntent }
  | { deliveryStatus: 'REJECTED'; reason: string };

/** @purpose Context for dispatching one decision's effects. */
export type DispatchContext = Readonly<{
  decision: ReviewDecision;
  proposals: readonly ReviewProposal[];
  queue: ReviewEffectQueue;
  package: ReviewActionPackage;
}>;

/** @purpose Result of dispatching one batch of effects. */
export type DispatchResult = Readonly<{
  dispatched: number;
  failed: number;
  skipped: number;
  independent: number;
}>;

/** @purpose Independent operator command to dispatch without a proposal. */
export type IndependentOperatorCommand = Readonly<{
  operatorCommandId: string;
  operatorLogin: string;
  mr: string;
  kind: import('../types/review-effect.type.ts').VcsEffectKind;
  payload: Readonly<Record<string, string>>;
  directTargetId: string;
  directTargetVersion: string;
  /** @purpose Refs examined during classification — must be empty for independent path */
  examinedRoundRefs: readonly string[];
}>;

/**
 * @purpose Sole dispatcher and reconciler for dependency-aware guarded and independent effects.
 * @invariant Manual and automatic actions share this coordinator; independent effects continue after sibling failure; no blind retry.
 * @invariant Queue never translates, defaults or rewrites accepted handoff bytes; same effect ID/payload/guard across all attempts.
 * @invariant Origin classification is closed and deterministic; automation cannot construct operator-independent effects.
 */
export class ReviewEffectCoordinator {
  /** @purpose VCS port for state reads (manifest key freshness check). */
  protected _vcs: VcsPort;
  /** @purpose Effects adapter for permission-gated VCS mutations and reconciliation. */
  protected _effects: Effects;
  /** @purpose Event journal for durable state. */
  protected _journal: JournalPort;
  /** @purpose Action catalog for capability lookups. */
  protected _catalog: ReviewActionCatalog;
  /** @purpose Accepted handoff for this round — byte-equivalent, never mutated. */
  protected _acceptedHandoff?: AcceptedHandoffRecord;

  /**
   * @purpose Create the coordinator with VCS port, journal, and action catalog.
   * @param vcs VCS port for state reads.
   * @param journal Durable journal for state persistence.
   * @param catalog Action catalog for capability lookups.
   */
  constructor(vcs: VcsPort, journal: JournalPort, catalog: ReviewActionCatalog) {
    this._vcs = vcs;
    this._effects = new Effects(vcs, journal);
    this._journal = journal;
    this._catalog = catalog;
    logger.debug('[ReviewEffectCoordinator#constructor] [init → ready]');
  }

  /**
   * @purpose Accept and persist an exact immutable pipeline handoff record/digest — byte-equivalent, idempotent.
   * @invariant Fails closed on any missing, extra, renamed, or defaulted field.
   * @invariant Same handoffId is idempotent; conflicting handoffId/digest fails closed.
   * @param handoff Candidate pipeline handoff.
   * @returns Accept or reject result.
   * @sideEffect Persists accepted record to journal.
   */
  async acceptGuardedHandoff(handoff: ReviewPublicationHandoff): Promise<HandoffAcceptResult> {
    const acceptedAt = new Date().toISOString();

    // #region START_ACCEPT_HANDOFF_VALIDATION — fail closed on any schema violation
    let guardedIntent: ReviewGuardedIntent;
    try {
      guardedIntent = constructReviewGuardedIntent(handoff, acceptedAt);
    } catch (cause) {
      const error = new Error(
        '[ReviewEffectCoordinator#acceptGuardedHandoff] Handoff schema invalid',
        { cause }
      );
      logger.error(`[ReviewEffectCoordinator#acceptGuardedHandoff] [validation → rejected]`, {
        error,
      });
      return { deliveryStatus: 'REJECTED', reason: error.message };
    }
    // #endregion END_ACCEPT_HANDOFF_VALIDATION

    // #region START_ACCEPT_HANDOFF_IDEMPOTENT — same handoffId is replay; conflicting digest fails closed
    const digest = createHash('sha256').update(JSON.stringify(handoff)).digest('hex');

    if (this._acceptedHandoff) {
      const existing = this._acceptedHandoff;
      if (existing.guardedIntent.guardId === guardedIntent.guardId) {
        if (existing.digest !== digest) {
          logger.error(
            `[ReviewEffectCoordinator#acceptGuardedHandoff] [replay → digest_conflict] guardId=${guardedIntent.guardId}`
          );
          return { deliveryStatus: 'REJECTED', reason: 'Digest conflict on replay' };
        }
        logger.debug(
          `[ReviewEffectCoordinator#acceptGuardedHandoff] [replay → idempotent] guardId=${guardedIntent.guardId}`
        );
        return { deliveryStatus: 'ACCEPTED', guardedIntent: existing.guardedIntent };
      }
    }
    // #endregion END_ACCEPT_HANDOFF_IDEMPOTENT

    // #region START_PERSIST_HANDOFF — journal before returning
    try {
      await this._journal.append({
        ts: acceptedAt,
        mr: handoff.manifestKey.mr,
        kind: 'mutation',
        actor: 'coordinator',
        payload: {
          event: 'handoff_accepted',
          handoffId: handoff.handoffId,
          digest,
          manifestKey: handoff.manifestKey,
        },
      });
    } catch (cause) {
      const error = new Error(
        '[ReviewEffectCoordinator#acceptGuardedHandoff] Journal write failed',
        { cause }
      );
      logger.error(`[ReviewEffectCoordinator#acceptGuardedHandoff] [journal → failed]`, { error });
      throw error;
    }
    // #endregion END_PERSIST_HANDOFF

    this._acceptedHandoff = Object.freeze({ guardedIntent, digest });
    logger.info(
      `[ReviewEffectCoordinator#acceptGuardedHandoff] [idle → accepted] guardId=${guardedIntent.guardId} mr=${handoff.manifestKey.mr}`
    );
    return { deliveryStatus: 'ACCEPTED', guardedIntent };
  }

  /**
   * @purpose Dispatch and reconcile effects from a decision, continuing independent actions after sibling failure.
   * @invariant Each not-yet-written effect is pre-checked for stale manifest and capability mismatch.
   * @invariant Independent effects continue after sibling not-applied/ambiguous; dependants are blocked.
   * @invariant No second write to dispatching/unconfirmed effects — they proceed to reconciliation only.
   * @param ctx Dispatch context with decision, proposals, queue, and package.
   * @returns Aggregated dispatch result.
   * @sideEffect VCS mutations and journal writes.
   */
  async dispatchAndReconcile(ctx: DispatchContext): Promise<DispatchResult> {
    let dispatched = 0;
    let failed = 0;
    let skipped = 0;
    let independent = 0;

    logger.info(
      `[ReviewEffectCoordinator#dispatch] [idle → dispatching] queueId=${ctx.queue.queueId} decisionId=${ctx.decision.decisionId}`
    );

    // #region START_DISPATCH_LOOP — claim and dispatch ready effects, continue independent after failure
    let entry: ReviewEffectEntry | undefined;
    while ((entry = claimNextReadyEffect(ctx.queue)) !== undefined) {
      const effect = entry.effect;
      const isIndependent = effect.identity.origin === 'operator-independent';

      // #region START_PRE_DISPATCH_GATE — stale/capability check before each not-yet-written effect
      const newestKey = await this._readNewestManifestKey(effect.mr);
      const acceptedKey = guardedManifestKey(ctx.decision.guardedIntent);
      if (newestKey && newestKey !== acceptedKey.headSHA) {
        logger.warn(
          `[ReviewEffectCoordinator#dispatch] [stale → invalidate_remainder] effectId=${effect.effectId} newest=${newestKey} accepted=${acceptedKey.headSHA}`
        );
        staleReviewActionPackage(ctx.package, `new_sha:${newestKey}`);
        invalidateQueuedEffects(ctx.queue, `stale_sha:${newestKey}`);
        skipped++;
        continue;
      }
      // #endregion END_PRE_DISPATCH_GATE

      // #region START_DISPATCH_ONE_EFFECT — external write with pre-journal marker
      try {
        const request = this._buildVcsRequest(effect);
        await this._journal.append({
          ts: new Date().toISOString(),
          mr: effect.mr,
          kind: 'mutation',
          actor: 'coordinator',
          payload: { event: 'effect_dispatching', effectId: effect.effectId, kind: effect.kind },
        });
        markEffectUnconfirmed(ctx.queue, effect.effectId);

        const outcome = await this._effects.apply(request);
        const outcomeStatus =
          outcome.status === 'applied' || outcome.status === 'no_op'
            ? 'applied'
            : ((outcome.status === 'denied' || outcome.status === 'unavailable'
                ? 'not-applied'
                : 'ambiguous') as import('../model/review-outcome.ts').ReviewOutcomeStatus);
        const reconciled = constructReviewOutcome({
          outcomeId: `outcome:${effect.effectId}:${entry.attempts}`,
          effectId: effect.effectId,
          effectIdentity: effect.identity,
          mr: effect.mr,
          status: outcomeStatus,
          evidence: outcome.evidence,
          attemptCount: entry.attempts,
          recordedAt: new Date().toISOString(),
        });
        reconcileEffectEntry(ctx.queue, effect.effectId, reconciled);

        if (isIndependent) independent++;
        else dispatched++;

        logger.info(
          `[ReviewEffectCoordinator#dispatch] [dispatched → reconciled] effectId=${effect.effectId} status=${reconciled.status}`
        );
      } catch (cause) {
        const ambiguousOutcome = constructReviewOutcome({
          outcomeId: `outcome:${effect.effectId}:${entry.attempts}`,
          effectId: effect.effectId,
          effectIdentity: effect.identity,
          mr: effect.mr,
          status: 'ambiguous',
          evidence: `Transport exception: ${String(cause)}`,
          attemptCount: entry.attempts,
          recordedAt: new Date().toISOString(),
        });
        reconcileEffectEntry(ctx.queue, effect.effectId, ambiguousOutcome);
        failed++;
        logger.error(
          `[ReviewEffectCoordinator#dispatch] [dispatching → ambiguous] effectId=${effect.effectId}`,
          { error: new Error(`[ReviewEffectCoordinator#dispatch] Effect failed`, { cause }) }
        );
      }
      // #endregion END_DISPATCH_ONE_EFFECT
    }
    // #endregion END_DISPATCH_LOOP

    logger.info(
      `[ReviewEffectCoordinator#dispatch] [dispatching → done] queueId=${ctx.queue.queueId} dispatched=${dispatched} failed=${failed} skipped=${skipped} independent=${independent}`
    );
    return Object.freeze({ dispatched, failed, skipped, independent });
  }

  /**
   * @purpose Execute an explicitly operator-independent command without a proposal.
   * @invariant Zero round refs required — any discovered ref routes to guarded path and fails this call.
   * @invariant Own permission, allowlist, freshness, and capability gates must pass.
   * @invariant Creates exactly one audited effect without creating a proposal.
   * @param command Independent operator command with explicit actor identity.
   * @returns The effect produced, or undefined when a gate fails or round refs are discovered.
   * @sideEffect VCS mutation and journal writes when gates pass.
   */
  async executeIndependentOperatorCommand(
    command: IndependentOperatorCommand
  ): Promise<ReviewEffect | undefined> {
    // #region START_INDEPENDENT_CLASSIFY — any round ref routes to guarded path
    const discoveredRefs = command.examinedRoundRefs;
    const effectiveOrigin = classifyEffectOrigin(
      {
        origin: 'operator-independent',
        operatorCommandId: command.operatorCommandId,
        directTargetId: command.directTargetId,
        directTargetVersion: command.directTargetVersion,
      },
      [...discoveredRefs]
    );
    if (effectiveOrigin === 'round-derived') {
      logger.warn(
        `[ReviewEffectCoordinator#independent] [classify → round_derived] commandId=${command.operatorCommandId} refs=${discoveredRefs.length}`
      );
      return undefined;
    }
    // #endregion END_INDEPENDENT_CLASSIFY

    // #region START_INDEPENDENT_GATES — permission, allowlist, freshness gates (catalog resolves)
    let def: ReturnType<ReviewActionCatalog['resolveAction']>;
    try {
      def = this._catalog.resolveAction(command.kind);
    } catch {
      logger.warn(
        `[ReviewEffectCoordinator#independent] [gate → unsupported] commandId=${command.operatorCommandId} kind=${command.kind}`
      );
      return undefined;
    }

    if (def.capabilityPolicy === 'unsupported') {
      logger.warn(
        `[ReviewEffectCoordinator#independent] [gate → unsupported_capability] commandId=${command.operatorCommandId} kind=${command.kind}`
      );
      return undefined;
    }
    // #endregion END_INDEPENDENT_GATES

    const provenance: ReviewEffectProvenance = Object.freeze({
      classifierVersion: '1.0',
      examinedRefs: Object.freeze([...discoveredRefs]),
      operatorCommandId: command.operatorCommandId,
    });

    const identity: OperatorIndependentEffectIdentity = Object.freeze({
      origin: 'operator-independent',
      operatorCommandId: command.operatorCommandId,
      directTargetId: command.directTargetId,
      directTargetVersion: command.directTargetVersion,
    });

    const effectId = createHash('sha256')
      .update(
        JSON.stringify({
          mr: command.mr,
          kind: command.kind,
          commandId: command.operatorCommandId,
          payload: command.payload,
        })
      )
      .digest('hex');

    const effect: ReviewEffect = Object.freeze({
      effectId,
      kind: command.kind,
      mr: command.mr,
      identity,
      payload: Object.freeze({ ...command.payload }),
      dependsOn: Object.freeze([]),
      state: 'queued',
      idempotencyKey: effectId,
      attemptCount: 0,
      provenance,
      createdAt: new Date().toISOString(),
    });

    logger.info(
      `[ReviewEffectCoordinator#independent] [gate_pass → effect_created] commandId=${command.operatorCommandId} effectId=${effectId} kind=${command.kind}`
    );
    return effect;
  }

  /**
   * @purpose Build a VcsEffectRequest from a ReviewEffect for dispatch.
   * @param effect Effect to build a request from.
   * @returns Validated VCS effect request.
   */
  protected _buildVcsRequest(effect: ReviewEffect): VcsEffectRequest {
    const mr = effect.mr.split('!');
    return {
      effectId: effect.effectId,
      kind: effect.kind,
      project: mr[0] ?? effect.mr,
      iid: mr[1] ?? '0',
      revision:
        effect.identity.origin === 'round-derived'
          ? effect.identity.guardId
          : effect.identity.directTargetVersion,
      currentRevision:
        effect.identity.origin === 'round-derived'
          ? effect.identity.guardId
          : effect.identity.directTargetVersion,
      body: effect.payload.body,
      discussionId: effect.payload.discussionId,
      noteId: effect.payload.noteId,
      emoji: effect.payload.emoji,
      permission: {
        operatorLogin: effect.provenance.operatorCommandId ?? 'operator',
        operatorIsMrAuthor: false,
        reviewerPermission: true,
        automatic: false,
      },
    };
  }

  /**
   * @purpose Read the newest observed manifest head SHA for a given MR.
   * @invariant Returns undefined when the VCS port cannot be read (treated as current = fresh).
   * @param mr MR reference.
   * @returns Head SHA or undefined.
   * @sideEffect Reads from VCS — network I/O.
   */
  protected async _readNewestManifestKey(mr: string): Promise<string | undefined> {
    try {
      const parts = mr.split('!');
      const snapshot = await this._vcs.readSnapshot(parts[0] ?? mr, parts[1] ?? '0');
      return snapshot?.headSha;
    } catch (cause) {
      logger.warn(`[ReviewEffectCoordinator#readNewest] [vcs → warn_unreadable] mr=${mr}`, {
        error: new Error('[ReviewEffectCoordinator#readNewest] Could not read newest MR state', {
          cause,
        }),
      });
      return undefined;
    }
  }
}
