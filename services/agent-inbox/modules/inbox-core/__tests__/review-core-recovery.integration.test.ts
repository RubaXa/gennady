// @file: Filesystem integration proof for lifecycle truth table, torn-tail recovery and disposable cache rebuild.
// @consumers: node:test runner
// @tasks: TSK-173

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventJournal } from '../event-journal.ts';
import { LocalArtifactStore } from '../adapters/local-artifact-store.ts';
import { ReviewConfig } from '../review-config.ts';
import { StateStore } from '../state-store.ts';
import { ReviewState } from '../state/review-state.ts';
import { makeTestTmpDir } from '../test-support/test-tmp.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

type ReviewCoreRecoveryContext = {
  root: string;
  store: StateStore;
  event(input: Partial<Record<string, unknown>>): ReviewEvent;
};

let context: ReviewCoreRecoveryContext | undefined;

function createReviewCoreRecoveryContext(): ReviewCoreRecoveryContext {
  const root = makeTestTmpDir('review-core-recovery-');
  return {
    root,
    store: new StateStore(root),
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

afterEach(async () => {
  if (context) await rm(context.root, { recursive: true, force: true });
  context = undefined;
});

describe('canonical review recovery', () => {
  it('lifecycle truth table and crash cache recovery preserve canonical state', async () => {
    // contract: journals survive torn tails; cache deletion cannot change canonical bytes after rebuild
    context = createReviewCoreRecoveryContext();
    const config = new ReviewConfig({ activityHorizonMs: 90 * 24 * 60 * 60_000 });
    // #region START_RECOVERY_SETUP_CANONICAL_EVENT_STREAM
    const observed = context.event({});
    const completed = context.event({
      id: 'completed',
      kind: 'lifecycle_completed',
      occurredAt: '2026-01-02T00:00:00.000Z',
      payload: {},
    });
    const reactivated = context.event({
      id: 'reactivated',
      kind: 'commit_pushed',
      occurredAt: '2026-05-01T00:00:00.000Z',
      payload: { sha: 'commit-2', baseSha: 'head-1', headSha: 'head-2' },
    });

    const open = context.event({
      id: 'open',
      payload: { ...observed.payload, state: 'open' },
    });
    // #endregion END_RECOVERY_SETUP_CANONICAL_EVENT_STREAM
    // #region START_RECOVERY_ASSERT_LIFECYCLE_TRUTH_TABLE
    assert.throws(
      () => ReviewState.fold([open, completed], config),
      /\[ReviewLifecycle#complete\] Open MR cannot be completed/
    );
    assert.strictEqual(
      ReviewState.fold([open], config).isVisible('2026-01-02T00:00:00.000Z'),
      true
    );
    assert.strictEqual(
      ReviewState.fold([open], config).isVisible('2026-04-02T00:00:00.000Z'),
      false
    );
    assert.strictEqual(
      ReviewState.fold([observed], config).isVisible('2026-01-02T00:00:00.000Z'),
      true
    );
    assert.strictEqual(
      ReviewState.fold([observed], config).isVisible('2026-04-02T00:00:00.000Z'),
      false
    );
    // #endregion END_RECOVERY_ASSERT_LIFECYCLE_TRUTH_TABLE

    // #region START_RECOVERY_TRIGGER_TORN_JOURNAL_TAIL
    const journal = context.store.openReviewJournal();
    await journal.appendReviewEvent(observed);
    await journal.appendReviewEvent(completed);
    await journal.appendReviewEvent(reactivated);
    await appendFile(
      join(context.root, 'agent-inbox', 'review-events.jsonl'),
      '{"version":1,"id":"torn-tail"',
      'utf8'
    );
    // #endregion END_RECOVERY_TRIGGER_TORN_JOURNAL_TAIL

    // #region START_RECOVERY_ASSERT_REACTIVATED_FOLD
    const recovered = context.store.openReviewJournal().replayReviewEvents();
    assert.strictEqual(recovered.length, 3);
    const rebuilt = ReviewState.fold(recovered, config);
    assert.strictEqual(rebuilt.isVisible('2026-05-01T00:00:00.000Z'), true);
    assert.strictEqual(rebuilt.lifecycle().toSnapshot().completedAt, null);
    // #endregion END_RECOVERY_ASSERT_REACTIVATED_FOLD

    // #region START_RECOVERY_TRIGGER_DELETE_AND_REBUILD_CACHE
    const cachePath = join(context.root, 'agent-inbox', 'review-state-registry.json');
    await context.store.rebuildReviewStateRegistry(config, '2026-05-01T00:00:00.000Z');
    const firstBytes = await readFile(cachePath);
    await rm(cachePath);
    await context.store.rebuildReviewStateRegistry(config, '2026-05-01T00:00:00.000Z');
    const secondBytes = await readFile(cachePath);
    assert.deepStrictEqual(secondBytes, firstBytes);
    // #endregion END_RECOVERY_TRIGGER_DELETE_AND_REBUILD_CACHE

    // #region START_RECOVERY_ASSERT_LOCAL_ARTIFACT_CONTRACT
    const artifacts = new LocalArtifactStore(context.root);
    const artifactBytes = new TextEncoder().encode('canonical evidence');
    await artifacts.put({ mr: observed.identifyMr(), id: 'evidence-1' }, artifactBytes);
    assert.deepStrictEqual(
      await artifacts.read({ mr: observed.identifyMr(), id: 'evidence-1' }),
      artifactBytes
    );
    assert.deepStrictEqual(await artifacts.list(observed.identifyMr()), ['evidence-1']);
    // #endregion END_RECOVERY_ASSERT_LOCAL_ARTIFACT_CONTRACT

    // #region START_RECOVERY_ASSERT_DURABLE_FAILURE_UNACKNOWLEDGED
    const failedParent = join(context.root, 'durable-failure');
    await writeFile(failedParent, 'not-a-directory', 'utf8');
    const failingJournal = new EventJournal(join(failedParent, 'events.jsonl'));
    await assert.rejects(
      () => failingJournal.appendReviewEvent(observed),
      /\[EventJournal#appendReviewEvent\] Durable append failed/
    );
    assert.strictEqual(failingJournal.replayReviewEvents().length, 0);
    assert.strictEqual(failingJournal.identity, 'local-event-journal');
    assert.deepStrictEqual(failingJournal.health(), {
      status: 'failed',
      detail: '[EventJournal#appendReviewEvent] Durable append failed',
    });
    const failingArtifacts = new LocalArtifactStore(failedParent);
    await assert.rejects(
      () => failingArtifacts.put({ mr: observed.identifyMr(), id: 'evidence' }, new Uint8Array()),
      /\[LocalArtifactStore#put\] Durable artifact write failed/
    );
    assert.deepStrictEqual(failingArtifacts.health(), {
      status: 'failed',
      detail: '[LocalArtifactStore#put] Durable artifact write failed',
    });
    // #endregion END_RECOVERY_ASSERT_DURABLE_FAILURE_UNACKNOWLEDGED
  });
});
