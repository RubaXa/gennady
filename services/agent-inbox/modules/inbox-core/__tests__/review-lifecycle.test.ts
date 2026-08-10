// @file: Lifecycle visibility truth-table tests for terminal inactivity, completion and reactivation.
// @consumers: node:test runner
// @tasks: TSK-173

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewConfig } from '../review-config.ts';
import { ReviewState } from '../state/review-state.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

type ReviewLifecycleContext = {
  config: ReviewConfig;
  event(input: Partial<Record<string, unknown>>): ReviewEvent;
};

function createReviewLifecycleContext(): ReviewLifecycleContext {
  return {
    config: new ReviewConfig({ activityHorizonMs: 90 * 24 * 60 * 60_000 }),
    event: (input) =>
      ReviewEvent.validate({
        version: 1,
        id: 'observed',
        mr: { project: 'group/project', iid: '42' },
        kind: 'mr_observed',
        actor: { kind: 'system', id: 'gitlab-sync' },
        occurredAt: '2026-01-01T00:00:00.000Z',
        payload: {
          state: 'merged',
          participation: {
            author: false,
            reviewer: true,
            assignee: false,
            mentioned: false,
            commented: true,
            approved: false,
          },
          baseSha: 'base',
          headSha: 'head-1',
        },
        ...input,
      }),
  };
}

describe('ReviewLifecycle', () => {
  it('inactive terminal MR hides while history remains', () => {
    // #region START_INACTIVE_TERMINAL_SETUP_RETAINED_HISTORY
    const context = createReviewLifecycleContext();
    const state = ReviewState.fold([context.event({})], context.config);
    // #endregion END_INACTIVE_TERMINAL_SETUP_RETAINED_HISTORY

    // #region START_INACTIVE_TERMINAL_ASSERT_HORIZON_BOUNDARY
    assert.strictEqual(state.isVisible('2026-03-31T23:59:59.999Z'), true);
    assert.strictEqual(state.isVisible('2026-04-02T00:00:00.000Z'), false);
    assert.deepStrictEqual(state.lifecycle().toSnapshot(), {
      state: 'merged',
      trackedAt: '2026-01-01T00:00:00.000Z',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      eventsEmitted: [
        {
          kind: 'lifecycle_changed',
          state: 'merged',
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    // #endregion END_INACTIVE_TERMINAL_ASSERT_HORIZON_BOUNDARY
  });

  it('new event clears completedAt and returns both completed and horizon-hidden terminal MR', () => {
    const context = createReviewLifecycleContext();
    // #region START_REACTIVATION_SETUP_COMPLETION_AND_ACTIVITY
    const completed = context.event({
      id: 'completed',
      kind: 'lifecycle_completed',
      occurredAt: '2026-01-02T00:00:00.000Z',
      payload: {},
    });
    const newActivity = context.event({
      id: 'new-activity',
      kind: 'description_changed',
      occurredAt: '2026-05-01T00:00:00.000Z',
      payload: { revision: 'description-v2' },
    });
    // #endregion END_REACTIVATION_SETUP_COMPLETION_AND_ACTIVITY

    // #region START_REACTIVATION_TRIGGER_REFOLD_HISTORY
    const hiddenCompleted = ReviewState.fold([context.event({}), completed], context.config);
    const returned = ReviewState.fold([context.event({}), completed, newActivity], context.config);
    // #endregion END_REACTIVATION_TRIGGER_REFOLD_HISTORY

    // #region START_REACTIVATION_ASSERT_VISIBILITY_AND_COMPLETION
    assert.strictEqual(hiddenCompleted.isVisible('2026-01-03T00:00:00.000Z'), false);
    assert.strictEqual(returned.isVisible('2026-05-01T00:00:00.000Z'), true);
    assert.strictEqual(returned.lifecycle().toSnapshot().completedAt, null);
    assert.strictEqual(
      returned.lifecycle().toSnapshot().lastActivityAt,
      '2026-05-01T00:00:00.000Z'
    );
    assert.deepStrictEqual(returned.lifecycle().emittedEvents(), [
      {
        kind: 'lifecycle_changed',
        state: 'merged',
        occurredAt: '2026-01-01T00:00:00.000Z',
      },
      { kind: 'completed', state: 'merged', occurredAt: '2026-01-02T00:00:00.000Z' },
      {
        kind: 'lifecycle_changed',
        state: 'merged',
        occurredAt: '2026-05-01T00:00:00.000Z',
        reactivated: true,
      },
    ]);
    // #endregion END_REACTIVATION_ASSERT_VISIBILITY_AND_COMPLETION
  });
});
