// @file: ReviewEffectQueue entity — durable ordered effect state from enqueue through confirmed outcome.
// @consumers: ReviewEffectCoordinator
// @tasks: TSK-177

import { logger } from '#logger';
import type { ReviewEffect, ReviewEffectState } from '../types/review-effect.type.ts';
import type { ReviewOutcome } from './review-outcome.ts';

/**
 * @purpose One entry in the effect queue with its associated outcome when available.
 * @invariant Entry state follows: queued → dispatching → unconfirmed → reconciled; invalidated only from queued.
 */
export type ReviewEffectEntry = {
  /** @purpose Effect this entry tracks */
  effect: ReviewEffect;
  /** @purpose Current entry state — mirrors effect.state for queue-level visibility */
  state: ReviewEffectState;
  /** @purpose Number of dispatch attempts | @invariant >= 0 */
  attempts: number;
  /** @purpose ISO timestamp of the first dispatch | @invariant absent until dispatching */
  firstDispatchedAt?: string;
  /** @purpose Reconciled outcome | @invariant absent until state=reconciled */
  outcome?: ReviewOutcome;
};

/**
 * @purpose Durable ordered queue aggregate for one decision's effects or one independent operator command.
 * @invariant One queue aggregate per guarded decision or per explicit independent operator command.
 * @invariant Persisted before first dispatch; survives crash.
 * @invariant Invalidation affects only queued/not-yet-written entries; dispatching/unconfirmed remain until reconciled.
 * @invariant Independent effects continue after sibling not-applied/ambiguous; only dependants are blocked.
 */
export type ReviewEffectQueue = {
  /** @purpose Stable queue aggregate identifier */
  queueId: string;
  /** @purpose Closed origin that determines which identity refs this queue carries */
  origin: 'round-derived' | 'operator-independent';
  /** @purpose For round-derived: package and decision refs | @invariant absent for operator-independent */
  roundRefs?: Readonly<{ packageId: string; decisionId: string; guardId: string }>;
  /** @purpose For operator-independent: operator command audit ref | @invariant absent for round-derived */
  operatorCommandRef?: string;
  /** @purpose Ordered effect entries */
  entries: ReviewEffectEntry[];
  /** @purpose ISO timestamp of queue creation */
  createdAt: string;
};

/**
 * @purpose Enqueue an effect idempotently — rejects an effect with the same effectId.
 * @invariant Same effectId is treated as a replay; no duplicate entry is created.
 * @param queue Mutable queue.
 * @param effect Effect to enqueue.
 */
export function enqueueReviewEffect(queue: ReviewEffectQueue, effect: ReviewEffect): void {
  const existing = queue.entries.find((e) => e.effect.effectId === effect.effectId);
  if (existing) {
    logger.debug(
      `[ReviewEffectQueue#enqueue] [dedup → skip] queueId=${queue.queueId} effectId=${effect.effectId}`
    );
    return;
  }
  const entry: ReviewEffectEntry = {
    effect,
    state: 'queued',
    attempts: 0,
  };
  queue.entries.push(entry);
  logger.debug(
    `[ReviewEffectQueue#enqueue] [idle → queued] queueId=${queue.queueId} effectId=${effect.effectId} kind=${effect.kind}`
  );
}

/**
 * @purpose Claim the next ready effect — one whose dependencies are all reconciled applied.
 * @invariant Only queued effects with all deps satisfied are claimable.
 * @invariant External write-started is durably marked as dispatching before I/O.
 * @param queue Mutable queue.
 * @returns The next ready entry or undefined when nothing is ready.
 */
export function claimNextReadyEffect(queue: ReviewEffectQueue): ReviewEffectEntry | undefined {
  const reconciledApplied = new Set(
    queue.entries
      .filter((e) => e.state === 'reconciled' && e.outcome?.status === 'applied')
      .map((e) => e.effect.effectId)
  );

  // #region START_CLAIM_READY_EFFECT — dependency-aware selection; independent effects skip failed siblings
  for (const entry of queue.entries) {
    if (entry.state !== 'queued') continue;
    const depsOk = entry.effect.dependsOn.every((dep) => reconciledApplied.has(dep));
    if (!depsOk) continue;
    entry.state = 'dispatching';
    entry.attempts += 1;
    entry.firstDispatchedAt ??= new Date().toISOString();
    logger.debug(
      `[ReviewEffectQueue#claim] [queued → dispatching] queueId=${queue.queueId} effectId=${entry.effect.effectId} attempt=${entry.attempts}`
    );
    return entry;
  }
  // #endregion END_CLAIM_READY_EFFECT

  return undefined;
}

/**
 * @purpose Mark an entry as unconfirmed after external write — awaiting mandatory read-after-effect.
 * @param queue Mutable queue.
 * @param effectId Effect ID to mark unconfirmed.
 */
export function markEffectUnconfirmed(queue: ReviewEffectQueue, effectId: string): void {
  const entry = queue.entries.find((e) => e.effect.effectId === effectId);
  if (!entry || entry.state !== 'dispatching') {
    logger.warn(
      `[ReviewEffectQueue#unconfirmed] [skip → not_dispatching] queueId=${queue.queueId} effectId=${effectId} state=${entry?.state ?? 'absent'}`
    );
    return;
  }
  entry.state = 'unconfirmed';
  logger.debug(
    `[ReviewEffectQueue#unconfirmed] [dispatching → unconfirmed] queueId=${queue.queueId} effectId=${effectId}`
  );
}

/**
 * @purpose Attach reconciled outcome — transitions entry to reconciled.
 * @param queue Mutable queue.
 * @param effectId Effect ID to reconcile.
 * @param outcome Reconciled outcome.
 */
export function reconcileEffectEntry(
  queue: ReviewEffectQueue,
  effectId: string,
  outcome: ReviewOutcome
): void {
  const entry = queue.entries.find((e) => e.effect.effectId === effectId);
  if (!entry) {
    logger.warn(
      `[ReviewEffectQueue#reconcile] [skip → not_found] queueId=${queue.queueId} effectId=${effectId}`
    );
    return;
  }
  entry.outcome = outcome;
  entry.state = 'reconciled';
  logger.info(
    `[ReviewEffectQueue#reconcile] [unconfirmed → reconciled] queueId=${queue.queueId} effectId=${effectId} status=${outcome.status}`
  );
}

/**
 * @purpose Invalidate all queued/not-yet-written entries when manifest key becomes stale.
 * @invariant Only queued entries are invalidated; dispatching/unconfirmed entries continue to reconciliation.
 * @param queue Mutable queue.
 * @param reason Cursor or event reference that triggered invalidation.
 * @returns Number of entries invalidated.
 */
export function invalidateQueuedEffects(queue: ReviewEffectQueue, reason: string): number {
  let count = 0;
  for (const entry of queue.entries) {
    if (entry.state !== 'queued') continue;
    entry.state = 'invalidated';
    count++;
  }
  if (count > 0) {
    logger.info(
      `[ReviewEffectQueue#invalidate] [queued → invalidated] queueId=${queue.queueId} count=${count} reason=${reason}`
    );
  }
  return count;
}
