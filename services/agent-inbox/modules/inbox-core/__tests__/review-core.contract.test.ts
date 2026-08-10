// @file: Closed-world contract tests for canonical review events, state values and core ports.
// @consumers: node:test runner
// @tasks: TSK-173

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ControlledClock } from '../adapters/controlled-clock.ts';
import { SystemClock } from '../adapters/system-clock.ts';
import { InMemoryArtifactStore } from '../adapters/in-memory-artifact-store.ts';
import { InMemoryJournal } from '../adapters/in-memory-journal.ts';
import type { ArtifactStorePort } from '../ports/artifact-store.port.ts';
import type { JournalPort } from '../event-journal.ts';
import { ReviewConfig } from '../review-config.ts';
import { ReviewState } from '../state/review-state.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

type ReviewCoreContractContext = {
  clock: ControlledClock;
  artifacts: ArtifactStorePort;
  journal: JournalPort;
  event(input: Partial<Record<string, unknown>>): ReviewEvent;
};

function createReviewCoreContractContext(): ReviewCoreContractContext {
  return {
    clock: new ControlledClock('2026-01-01T00:00:00.000Z'),
    artifacts: new InMemoryArtifactStore(),
    journal: new InMemoryJournal(),
    event: (input) =>
      ReviewEvent.validate({
        version: 1,
        id: 'event-1',
        mr: { project: 'group/project', iid: '42' },
        kind: 'mr_observed',
        actor: { kind: 'system', id: 'gitlab-sync' },
        occurredAt: '2026-01-01T00:00:00.000Z',
        payload: {
          state: 'merged',
          participation: {
            author: true,
            reviewer: true,
            assignee: false,
            mentioned: true,
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

describe('canonical review core contracts', () => {
  it('review core contracts reject unknown variants exhaustively', async () => {
    // contract: every closed event variant folds; invalid versions/kinds fail before persistence
    const context = createReviewCoreContractContext();
    // #region START_CORE_CONTRACT_SETUP_VALID_VARIANTS
    const variants = [
      context.event({ id: 'e0' }),
      context.event({
        id: 'e1',
        kind: 'commit_pushed',
        payload: { sha: 'c1', baseSha: 'base', headSha: 'head-2' },
      }),
      context.event({
        id: 'e2',
        kind: 'description_changed',
        payload: { revision: 'description-v2' },
      }),
      context.event({
        id: 'e3',
        kind: 'discussion_changed',
        actor: { kind: 'human', id: 'user-7' },
        payload: { discussionId: 'thread-1', humanReply: true },
      }),
      context.event({
        id: 'e4',
        kind: 'approval_changed',
        payload: { userId: 'user-8', approved: true },
      }),
      context.event({
        id: 'e5',
        kind: 'verification_requested',
        payload: { mode: 'manual' },
      }),
      context.event({
        id: 'e6',
        kind: 'verification_started',
        payload: { batchLastEventId: 'e4' },
      }),
      context.event({
        id: 'e7',
        kind: 'verification_failed',
        payload: { batchLastEventId: 'e4', reason: 'agent unavailable' },
      }),
      context.event({
        id: 'e8',
        kind: 'verification_started',
        payload: { batchLastEventId: 'e4' },
      }),
      context.event({
        id: 'e9',
        kind: 'verification_applied',
        payload: { batchLastEventId: 'e4', baseSha: 'base', headSha: 'head-2' },
      }),
      context.event({ id: 'e10', kind: 'lifecycle_completed', payload: {} }),
    ];
    // #endregion END_CORE_CONTRACT_SETUP_VALID_VARIANTS

    // #region START_CORE_CONTRACT_TRIGGER_PORT_BOUNDARIES
    for (const event of variants) await context.journal.appendReviewEvent(event);
    const state = ReviewState.fold(context.journal.replayReviewEvents(), new ReviewConfig());
    await context.artifacts.put(
      { mr: variants[0].identifyMr(), id: 'review-evidence' },
      new TextEncoder().encode('evidence')
    );
    // #endregion END_CORE_CONTRACT_TRIGGER_PORT_BOUNDARIES

    // #region START_CORE_CONTRACT_ASSERT_CLOSED_WORLD
    assert.deepStrictEqual(state.participation().toSnapshot(), {
      author: true,
      reviewer: true,
      assignee: false,
      mentioned: true,
      commented: true,
      approved: false,
      estimated: [],
      responsibilityGroup: 'owned',
    });
    assert.strictEqual(context.clock.now(), '2026-01-01T00:00:00.000Z');
    assert.deepStrictEqual(await context.artifacts.list(variants[0].identifyMr()), [
      'review-evidence',
    ]);
    assert.deepStrictEqual(state.toSnapshot().reviewSummary, {
      status: 'applied',
      firstEventId: 'e0',
      lastEventId: 'e4',
      baseSha: 'base',
      headSha: 'head-2',
      verificationDue: false,
      forceFullVerification: false,
    });
    assert.deepStrictEqual(state.toSnapshot().effectSummary, {
      manualVerificationRequests: 1,
      timerVerificationRequests: 0,
      verificationStarts: 2,
      verificationApplications: 1,
      verificationFailures: 1,
      lifecycleCompletions: 1,
    });
    assert.throws(
      () => context.event({ version: 2 }),
      /\[ReviewEvent\.validate\] Unsupported version/
    );
    assert.throws(
      () => context.event({ kind: 'unknown_event' }),
      /\[ReviewEvent\.validate\] Unsupported kind/
    );
    assert.throws(
      () =>
        context.event({
          kind: 'approval_changed',
          payload: { userId: 'user-8', approved: 'yes' },
        }),
      /\[ReviewEvent\.validate\] payload\.approved must be boolean/
    );
    // #endregion END_CORE_CONTRACT_ASSERT_CLOSED_WORLD
  });

  it('ReviewConfig validates timing, roots and bot/effect allowlists and emits changes', () => {
    const previous = new ReviewConfig();
    const configured = new ReviewConfig({
      botAllowlist: ['trusted-bot', 'trusted-bot'],
      stateRoots: ['/tmp/review-state'],
      effectAllowlist: ['approve'],
    });

    configured.verifyStateRoot('/tmp/review-state');
    assert.strictEqual(configured.permitsBot('trusted-bot'), true);
    assert.strictEqual(configured.permitsBot('unknown-bot'), false);
    assert.strictEqual(configured.permitsEffect('approve'), true);
    assert.deepStrictEqual(configured.botAllowlist, ['trusted-bot']);
    assert.deepStrictEqual(
      configured.describeChangeFrom(configured, '2026-01-01T00:00:00.000Z'),
      null
    );
    assert.deepStrictEqual(configured.describeChangeFrom(previous, '2026-01-01T00:00:00.000Z'), {
      kind: 'configuration_changed',
      actor: { kind: 'system', id: 'inbox-core' },
      occurredAt: '2026-01-01T00:00:00.000Z',
      before: previous.toSnapshot(),
      after: configured.toSnapshot(),
    });
    assert.throws(
      () => new ReviewConfig({ debounceMs: 0 }),
      /debounceMs must be finite and positive/
    );
    assert.throws(
      () => new ReviewConfig({ stateRoots: ['relative'] }),
      /stateRoots must contain absolute paths/
    );
    assert.throws(
      () => new ReviewConfig({ botAllowlist: [''] }),
      /botAllowlist must contain non-empty strings/
    );
    assert.throws(
      () => configured.verifyStateRoot('/tmp/other'),
      /outside the configured allowlist/
    );
  });

  it('ReviewState rejects duplicate, mixed-MR and unauthorized bot streams', () => {
    const context = createReviewCoreContractContext();
    const first = context.event({ id: 'duplicate' });
    const mixed = context.event({
      id: 'mixed',
      mr: { project: 'group/other', iid: '7' },
    });
    const bot = context.event({
      id: 'bot',
      actor: { kind: 'bot', id: 'untrusted-bot' },
    });

    assert.throws(() => ReviewState.fold([first, first]), /Duplicate event id/);
    assert.throws(() => ReviewState.fold([first, mixed]), /more than one MR/);
    assert.throws(() => ReviewState.fold([bot]), /outside the configured allowlist/);
    assert.doesNotThrow(() =>
      ReviewState.fold([bot], new ReviewConfig({ botAllowlist: ['untrusted-bot'] }))
    );
  });

  it('ClockPort schedules, cancels and exposes controlled and system adapter health', () => {
    const context = createReviewCoreContractContext();
    let calls = 0;
    const cancelled = context.clock.schedule('2026-01-01T00:01:00.000Z', () => (calls += 1));
    cancelled.cancel();
    context.clock.schedule('2026-01-01T00:01:00.000Z', () => (calls += 1));
    context.clock.advanceTo('2026-01-01T00:01:00.000Z');

    assert.strictEqual(calls, 1);
    assert.strictEqual(context.clock.identity, 'controlled-clock');
    assert.deepStrictEqual(context.clock.health(), { status: 'healthy' });
    const system = new SystemClock();
    assert.strictEqual(system.identity, 'system-clock');
    assert.throws(() => system.schedule('invalid', () => {}), /Scheduled time is invalid/);
    assert.deepStrictEqual(system.health(), {
      status: 'failed',
      detail: '[SystemClock#schedule] Scheduled time is invalid',
    });
  });

  it('storage ports expose identity and observable absent-address failures', async () => {
    const context = createReviewCoreContractContext();

    assert.strictEqual(context.journal.identity, 'in-memory-journal');
    assert.deepStrictEqual(context.journal.health(), { status: 'healthy' });
    assert.strictEqual(context.artifacts.identity, 'in-memory-artifact-store');
    assert.deepStrictEqual(context.artifacts.health(), { status: 'healthy' });
    await assert.rejects(
      () => context.artifacts.read({ mr: 'group/project!42', id: 'absent' }),
      /Artifact does not exist/
    );
    await assert.rejects(
      () => context.artifacts.put({ mr: '', id: 'invalid' }, new Uint8Array()),
      /Artifact address is invalid/
    );
  });
});
