// @file: Controlled-time tests for accumulated MR events, quiet timeout, reply debounce and manual verify.
// @consumers: node:test runner
// @tasks: TSK-173

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ControlledClock } from '../adapters/controlled-clock.ts';
import { ReviewConfig } from '../review-config.ts';
import { ReviewState } from '../state/review-state.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

type ReviewChangeBatchContext = {
  clock: ControlledClock;
  config: ReviewConfig;
  event(
    id: string,
    occurredAt: string,
    kind: string,
    payload: Record<string, unknown>
  ): ReviewEvent;
  observed(id?: string, occurredAt?: string): ReviewEvent;
};

function createReviewChangeBatchContext(): ReviewChangeBatchContext {
  const participation = {
    author: false,
    reviewer: true,
    assignee: false,
    mentioned: true,
    commented: true,
    approved: true,
  };
  const event = (id: string, occurredAt: string, kind: string, payload: Record<string, unknown>) =>
    ReviewEvent.validate({
      version: 1,
      id,
      mr: { project: 'group/project', iid: '42' },
      kind,
      actor: { kind: kind === 'discussion_changed' ? 'human' : 'system', id: 'actor-1' },
      occurredAt,
      payload,
    });
  return {
    clock: new ControlledClock('2026-01-01T00:00:00.000Z'),
    config: new ReviewConfig({ debounceMs: 5 * 60_000, quietMs: 10 * 60_000 }),
    event,
    observed: (id = 'observed', occurredAt = '2026-01-01T00:00:00.000Z') =>
      event(id, occurredAt, 'mr_observed', {
        state: 'open',
        participation,
        baseSha: 'base',
        headSha: 'head-1',
      }),
  };
}

describe('ReviewChangeBatch', () => {
  it('every MR event accumulates and postpones quiet deadline', () => {
    const context = createReviewChangeBatchContext();
    // #region START_ACCUMULATION_SETUP_EVENT_MATRIX
    const events = [
      context.observed(),
      context.event('commit', '2026-01-01T00:01:00.000Z', 'commit_pushed', {
        sha: 'commit-2',
        baseSha: 'base',
        headSha: 'head-2',
      }),
      context.event('description', '2026-01-01T00:02:00.000Z', 'description_changed', {
        revision: 'description-v2',
      }),
      context.event('approval', '2026-01-01T00:03:00.000Z', 'approval_changed', {
        userId: 'user-2',
        approved: true,
      }),
      context.event('discussion', '2026-01-01T00:04:00.000Z', 'discussion_changed', {
        discussionId: 'thread-1',
        humanReply: false,
      }),
    ];
    // #endregion END_ACCUMULATION_SETUP_EVENT_MATRIX

    const snapshot = ReviewState.fold(events, context.config).changeBatch().toSnapshot();

    // #region START_ACCUMULATION_ASSERT_RANGE_AND_QUIET_EDGE
    assert.deepStrictEqual(
      (snapshot.events as Array<{ kind: string }>).map((event) => event.kind),
      [
        'mr_observed',
        'commit_pushed',
        'description_changed',
        'approval_changed',
        'discussion_changed',
      ]
    );
    assert.strictEqual(snapshot.quietDeadline, '2026-01-01T00:14:00.000Z');
    assert.strictEqual(snapshot.headSha, 'head-2');
    context.clock.advanceTo('2026-01-01T00:13:59.999Z');
    assert.strictEqual(
      ReviewState.fold(events, context.config).changeBatch().isVerificationDue(context.clock.now()),
      false
    );
    context.clock.advanceTo('2026-01-01T00:14:00.000Z');
    assert.strictEqual(
      ReviewState.fold(events, context.config).changeBatch().isVerificationDue(context.clock.now()),
      true
    );
    // #endregion END_ACCUMULATION_ASSERT_RANGE_AND_QUIET_EDGE
  });

  it('human reply debounces and manual verify is immediate', () => {
    const context = createReviewChangeBatchContext();
    // #region START_REPLY_DEBOUNCE_SETUP_HUMAN_EVENT
    const reply = context.event('reply', '2026-01-01T00:01:00.000Z', 'discussion_changed', {
      discussionId: 'thread-1',
      humanReply: true,
    });
    const debounced = ReviewState.fold([context.observed(), reply], context.config);
    // #endregion END_REPLY_DEBOUNCE_SETUP_HUMAN_EVENT

    // #region START_REPLY_DEBOUNCE_ASSERT_CONTROLLED_EDGE
    context.clock.advanceTo('2026-01-01T00:05:59.999Z');
    assert.strictEqual(debounced.changeBatch().isVerificationDue(context.clock.now()), false);
    context.clock.advanceTo('2026-01-01T00:06:00.000Z');
    assert.strictEqual(debounced.changeBatch().isVerificationDue(context.clock.now()), true);
    // #endregion END_REPLY_DEBOUNCE_ASSERT_CONTROLLED_EDGE

    // #region START_MANUAL_VERIFY_TRIGGER_BYPASS
    const manual = context.event('manual', '2026-01-01T00:02:00.000Z', 'verification_requested', {
      mode: 'manual',
    });
    const immediate = ReviewState.fold([context.observed(), reply, manual], context.config);
    // #endregion END_MANUAL_VERIFY_TRIGGER_BYPASS
    // #region START_MANUAL_VERIFY_ASSERT_IMMEDIATE
    assert.strictEqual(immediate.changeBatch().isVerificationDue('2026-01-01T00:02:00.000Z'), true);
    // #endregion END_MANUAL_VERIFY_ASSERT_IMMEDIATE
  });

  it('verification transitions reject stale ranges and emit invalidation visibly', () => {
    const context = createReviewChangeBatchContext();
    const observed = context.observed();
    const started = context.event('started', '2026-01-01T00:01:00.000Z', 'verification_started', {
      batchLastEventId: 'observed',
    });
    const changed = context.event('changed', '2026-01-01T00:02:00.000Z', 'description_changed', {
      revision: 'description-v2',
    });
    const staleApplied = context.event(
      'stale-applied',
      '2026-01-01T00:03:00.000Z',
      'verification_applied',
      { batchLastEventId: 'observed', baseSha: 'base', headSha: 'head-1' }
    );

    const invalidated = ReviewState.fold(
      [observed, started, changed, staleApplied],
      context.config
    ).changeBatch();
    assert.strictEqual(invalidated.toSnapshot().status, 'stale');
    assert.deepStrictEqual(
      invalidated.emittedEvents().filter((event) => event.kind === 'batch_invalidated'),
      [
        {
          kind: 'batch_invalidated',
          eventId: 'changed',
          occurredAt: '2026-01-01T00:02:00.000Z',
        },
      ]
    );
    assert.throws(
      () =>
        ReviewState.fold(
          [
            observed,
            context.event('wrong-start', '2026-01-01T00:01:00.000Z', 'verification_started', {
              batchLastEventId: 'missing',
            }),
          ],
          context.config
        ),
      /Event range is stale/
    );
  });
});
