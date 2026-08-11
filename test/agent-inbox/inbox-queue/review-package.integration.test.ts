// @file: Integration test — new event preserves stale package disabled with replacement reference.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constructReviewActionPackage,
  staleReviewActionPackage,
} from '../../../services/agent-inbox/modules/inbox-queue/model/review-action-package.ts';
import {
  enqueueReviewEffect,
  claimNextReadyEffect,
  invalidateQueuedEffects,
} from '../../../services/agent-inbox/modules/inbox-queue/model/review-effect-queue.ts';
import { constructReviewProposal } from '../../../services/agent-inbox/modules/inbox-queue/model/review-proposal.ts';
import type { ReviewGuardedIntent } from '../../../services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts';
import type { ReviewEffect } from '../../../services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts';
import type { ReviewEffectQueue } from '../../../services/agent-inbox/modules/inbox-queue/model/review-effect-queue.ts';

function makeGuardedIntent(guardId = 'g1'): ReviewGuardedIntent {
  return Object.freeze({
    guardId,
    handoff: Object.freeze({
      handoffId: guardId,
      manifestKey: Object.freeze({ mr: 'g/p!1', headSHA: 'sha1', eventCursor: 'e1' }),
      manifestRef: 'mref',
      contractRef: 'cref',
      verdictRef: 'vref',
      guardedTransitionId: 'tid',
      acceptedObservedRevision: 'sha1:e1',
      capabilitySnapshot: Object.freeze({ can_comment: true }),
      capabilityVersion: 'v1',
      dispatchPolicy: Object.freeze({ kind: 'CONDITIONAL_SHA' as const, expectedHeadSHA: 'sha1' }),
      recommendationDigest: 'rdigest',
      provenance: Object.freeze(['s1']),
      deliveryStatus: 'ACCEPTED' as const,
    }),
    acceptedAt: '2026-08-11T10:00:00Z',
  });
}

function makeEffect(effectId: string, state: ReviewEffect['state'] = 'queued'): ReviewEffect {
  return Object.freeze({
    effectId,
    kind: 'comment' as const,
    mr: 'g/p!1',
    identity: Object.freeze({
      origin: 'round-derived' as const,
      guardId: 'g1',
      decisionId: 'd1',
      proposalId: 'p1',
    }),
    payload: Object.freeze({ body: 'test' }),
    dependsOn: Object.freeze([]),
    state,
    idempotencyKey: effectId,
    attemptCount: 0,
    provenance: Object.freeze({
      classifierVersion: '1.0',
      examinedRefs: Object.freeze([]),
    }),
    createdAt: '2026-08-11T10:00:00Z',
  });
}

type StaleContext = {
  gi: ReviewGuardedIntent;
  queue: ReviewEffectQueue;
};

function createStaleContext(): StaleContext {
  return {
    gi: makeGuardedIntent(),
    queue: {
      queueId: 'q1',
      origin: 'round-derived',
      roundRefs: Object.freeze({ packageId: 'pkg:g1', decisionId: 'd1', guardId: 'g1' }),
      entries: [],
      createdAt: '2026-08-11T10:00:00Z',
    },
  };
}

describe('ReviewPackageIntegration', () => {
  it('new event preserves stale package disabled with replacement reference', () => {
    // invariant: when a new MR event enters the batch, the unapplied package becomes stale;
    //   the package's data (reason, prior revision) remains queryable; apply is rejected
    // non-goal: does not verify that the coordinator itself detects the new event (that is the coordinator test)
    const { gi, queue } = createStaleContext();

    // #region START_STALE_SETUP_PACKAGE
    const p1 = constructReviewProposal({
      proposalId: 'proposal:g1:comment:1',
      guardedIntent: gi,
      actionKind: 'comment',
      mode: 'manual',
      payload: { body: 'comment text' },
      dependsOn: [],
      defaultSelected: true,
      rationale: 'default comment',
      available: true,
    });
    const pkg = constructReviewActionPackage({
      packageId: 'pkg:g1',
      guardedIntent: gi,
      proposals: [p1],
      createdAt: '2026-08-11T10:00:00Z',
    });
    assert.strictEqual(pkg.status, 'active');
    // #endregion END_STALE_SETUP_PACKAGE

    // #region START_STALE_SETUP_QUEUE
    const effect1 = makeEffect('eff-1');
    const effect2 = makeEffect('eff-2');
    enqueueReviewEffect(queue, effect1);
    enqueueReviewEffect(queue, effect2);
    assert.strictEqual(queue.entries.length, 2);
    assert.strictEqual(queue.entries[0]?.state, 'queued');
    assert.strictEqual(queue.entries[1]?.state, 'queued');
    // #endregion END_STALE_SETUP_QUEUE

    // Simulate: MR receives a new push event → package is staled, queued effects are invalidated
    const newEventCursor = 'new_sha:def456';
    staleReviewActionPackage(pkg, newEventCursor);
    const invalidatedCount = invalidateQueuedEffects(queue, newEventCursor);

    // #region START_STALE_ASSERT_OBSERVABILITY
    // Package status: stale; reason and prior revision remain visible
    assert.strictEqual(pkg.status, 'stale');
    assert.strictEqual(pkg.staleReason, newEventCursor);
    assert.strictEqual(pkg.stalePriorRevision, 1);

    // All queued effects are invalidated — no remaining claimable entry
    assert.strictEqual(invalidatedCount, 2);
    assert.strictEqual(queue.entries[0]?.state, 'invalidated');
    assert.strictEqual(queue.entries[1]?.state, 'invalidated');

    // claimNextReadyEffect returns undefined — nothing is claimable after invalidation
    const claimed = claimNextReadyEffect(queue);
    assert.strictEqual(claimed, undefined);
    // #endregion END_STALE_ASSERT_OBSERVABILITY

    // Package still carries the original selection and proposal data for display
    assert.strictEqual(pkg.proposals.length, 1);
    assert.deepStrictEqual(pkg.selectedProposalIds, ['proposal:g1:comment:1']);
  });

  it('invalidation skips dispatching and unconfirmed entries leaving only queued ones', () => {
    // invariant: dispatching/unconfirmed effects are not invalidated — they proceed to reconciliation
    const { queue } = createStaleContext();

    const queued = makeEffect('eff-queued');
    const dispatching = makeEffect('eff-dispatching', 'dispatching');
    const unconfirmed = makeEffect('eff-unconfirmed', 'unconfirmed');
    enqueueReviewEffect(queue, queued);
    // Inject non-queued entries directly (simulates mid-dispatch snapshot)
    queue.entries.push({ effect: dispatching, state: 'dispatching', attempts: 1 });
    queue.entries.push({ effect: unconfirmed, state: 'unconfirmed', attempts: 1 });

    const count = invalidateQueuedEffects(queue, 'new_event');

    assert.strictEqual(count, 1);
    assert.strictEqual(queue.entries[0]?.state, 'invalidated');
    assert.strictEqual(queue.entries[1]?.state, 'dispatching');
    assert.strictEqual(queue.entries[2]?.state, 'unconfirmed');
  });
});
