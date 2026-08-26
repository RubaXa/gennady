// @file: Unit tests for ReviewScenario — VCS capability matrix and controlled-clock scheduling.
// @consumers: node:test runner
// @tasks: TSK-180

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewScenario } from '../../modules/inbox-mocks/scenarios/review-scenario.ts';
import type { ScenarioMrFacts } from '../../modules/inbox-mocks/scenarios/review-scenario.ts';
import type { MockVcsEntry } from '../../modules/inbox-mocks/adapters/mock-vcs.adapter.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

// #region START_SHARED_FIXTURE
const FIXTURE_MR: VcsActionableMr = {
  iid: '1',
  project: 'test/proj',
  webUrl: 'https://gitlab.example.com/test/proj/-/merge_requests/1',
  title: 'feat: scenario test',
  description: '',
  author: 'j.author',
  reviewers: ['k.reviewer'],
  approvedBy: [],
  updatedAt: '2026-01-01T00:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  todoIds: [],
};

const FIXTURE_VCS_ENTRY: MockVcsEntry = {
  detail: {
    project: 'test/proj',
    iid: '1',
    webUrl: 'https://gitlab.example.com/test/proj/-/merge_requests/1',
    title: 'feat: scenario test',
    description: '',
    author: 'j.author',
    reviewers: ['k.reviewer'],
    approvedBy: [],
    updatedAt: '2026-01-01T00:00:00Z',
    state: 'opened',
    headSha: 'abc123',
    pipelineStatus: null,
    userNotesCount: 0,
    draft: false,
  },
  discussionPages: [{ discussions: [], pageInfo: { hasNextPage: false, endCursor: null } }],
};

const FIXTURE_INPUT: ScenarioMrFacts = {
  ref: 'test/proj!1',
  mr: FIXTURE_MR,
  vcsEntry: FIXTURE_VCS_ENTRY,
};
// #endregion END_SHARED_FIXTURE

function createScenario(runId: string): ReviewScenario {
  return ReviewScenario.fixed({ runId, mrsInput: [FIXTURE_INPUT] });
}

describe('ReviewScenario — capability matrix and clock', () => {
  it('mandatory failure reset effect and recovery matrix has no uncovered branch', async () => {
    // invariant: every VCS effect kind is recorded in invocation order;
    //            approval reset records approve then unapprove as distinct entries;
    //            scripted failure throws loudly while non-scripted effects on the same adapter succeed;
    //            ambiguous claim is returned when a running task occupies the lane
    const { vcs, executor, journal } = createScenario('run-matrix').start();

    // #region START_MATRIX_ALL_EFFECTS
    await vcs.postNote('test/proj', '1', 'top-level comment');
    await vcs.postNote('test/proj', '1', 'reply body', 'disc-1');
    await vcs.react('test/proj', '1', 'note-42', 'thumbsup');
    await vcs.resolve('test/proj', '1', 'disc-1');
    await vcs.reopen('test/proj', '1', 'disc-1');
    await vcs.approve('test/proj', '1');
    await vcs.unapprove('test/proj', '1');
    await vcs.requestChanges('test/proj', '1');
    await vcs.editDescription('test/proj', '1', 'updated description');
    // #endregion END_MATRIX_ALL_EFFECTS

    // #region START_MATRIX_ASSERT_EFFECTS
    const effects = vcs.recordedEffects();
    assert.strictEqual(effects.length, 9, 'all nine effect kinds recorded');
    assert.deepStrictEqual(
      effects.map((e) => e.kind),
      [
        'comment',
        'reply',
        'react',
        'resolve',
        'reopen',
        'approve',
        'unapprove',
        'request_changes',
        'edit_description',
      ],
      'effect kinds in invocation order'
    );
    assert.strictEqual(effects[5].kind, 'approve', 'approve precedes unapprove in approval reset');
    assert.strictEqual(effects[6].kind, 'unapprove', 'unapprove follows approve in approval reset');
    // #endregion END_MATRIX_ASSERT_EFFECTS

    // Partial failure — one scripted failure does not prevent other effects on the same adapter
    const { vcs: vcs2 } = createScenario('run-partial-fail').start();
    vcs2.seed(
      [FIXTURE_MR],
      { 'test/proj!1': FIXTURE_VCS_ENTRY },
      { 'approve:test/proj!1': { ok: false, error: 'permission denied' } }
    );

    await assert.rejects(
      () => vcs2.approve('test/proj', '1'),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /\[MockVcsAdapter#approve\].*permission denied/);
        return true;
      },
      'scripted approve failure throws with domain message'
    );
    await vcs2.postNote('test/proj', '1', 'still works after partial failure');
    assert.strictEqual(
      vcs2.recordedEffects().length,
      2,
      'failed approve and subsequent postNote are both recorded'
    );

    // Ambiguous claim — running task blocks next claim with reason=ambiguous
    const task = {
      taskId: 'task-matrix-1',
      kind: 'review',
      mr: 'test/proj!1',
      status: 'queued' as const,
      priority: 50,
      dependsOn: [] as readonly string[],
      dedupKey: 'review:test/proj!1',
      params: {},
      provenance: { createdBy: 'test', createdAt: '2026-01-01T00:00:00Z' },
    };
    await executor.enqueue(task);
    const firstClaim = await executor.claim('test/proj!1');
    assert.equal(firstClaim.claimed, true, 'first claim succeeds for queued task');

    const ambiguousClaim = await executor.claim('test/proj!1');
    assert.deepStrictEqual(
      ambiguousClaim,
      { claimed: false, reason: 'ambiguous' },
      'second claim returns ambiguous when running task occupies the lane'
    );

    const entries = journal.read();
    assert.ok(
      entries.some((e) => e.kind === 'task_created'),
      'task_created entry present in journal'
    );
    assert.ok(
      entries.some((e) => e.kind === 'task_status'),
      'task_status entry present in journal'
    );
  });

  it('controlled clock drives debounce and quiet timeout without sleeping', () => {
    // invariant: callbacks fire only at or past their scheduled instant; cancelled handles never fire;
    //            no wall-clock sleep is involved — advancing is purely deterministic
    const { clock } = createScenario('run-clock').start();

    // #region START_CLOCK_SCHEDULE_CALLBACKS
    const T1 = '2026-01-01T01:00:00.000Z';
    const T2 = '2026-01-01T02:00:00.000Z';
    const T3 = '2026-01-01T03:00:00.000Z';
    let firedT1 = false;
    let firedT2 = false;
    let firedT3 = false;
    clock.schedule(T1, () => {
      firedT1 = true;
    });
    clock.schedule(T2, () => {
      firedT2 = true;
    });
    const handleT3 = clock.schedule(T3, () => {
      firedT3 = true;
    });
    handleT3.cancel();
    // #endregion END_CLOCK_SCHEDULE_CALLBACKS

    assert.equal(firedT1, false, 'T1 not fired before advance');
    assert.equal(firedT2, false, 'T2 not fired before advance');
    assert.equal(firedT3, false, 'T3 not fired before advance');

    clock.advanceTo(T1);
    assert.equal(firedT1, true, 'T1 fires at debounce boundary — only T1 reached');
    assert.equal(firedT2, false, 'T2 not fired — quiet-timeout threshold not yet reached');

    clock.advanceTo(T2);
    assert.equal(firedT2, true, 'T2 fires when clock reaches quiet-timeout boundary');

    clock.advanceTo(T3);
    assert.equal(firedT3, false, 'cancelled T3 handle never fires past its instant');
  });
});
