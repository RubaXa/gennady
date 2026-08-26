// @file: Integration tests for ReviewScenario — determinism, run-id isolation and crash recovery.
// @consumers: node:test runner
// @tasks: TSK-180

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewScenario } from '../../modules/inbox-mocks/scenarios/review-scenario.ts';
import type { ScenarioMrFacts } from '../../modules/inbox-mocks/scenarios/review-scenario.ts';
import { MockRuntimeProfile } from '../../modules/inbox-mocks/adapters/mock-runtime-profile.adapter.ts';
import { InMemoryJournalAdapter } from '../../modules/inbox-mocks/adapters/in-memory-journal.adapter.ts';
import { DeterministicTaskExecutor } from '../../modules/inbox-mocks/adapters/deterministic-task-executor.adapter.ts';
import { ReviewRuntimeProfile } from '../../modules/inbox-core/runtime-profile.ts';
import type { MockVcsEntry } from '../../modules/inbox-mocks/adapters/mock-vcs.adapter.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

// #region START_SHARED_FIXTURE
const FIXTURE_MR: VcsActionableMr = {
  iid: '1',
  project: 'test/proj',
  webUrl: 'https://gitlab.example.com/test/proj/-/merge_requests/1',
  title: 'feat: integration test',
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
    title: 'feat: integration test',
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

describe('ReviewScenario — determinism, isolation and crash recovery', () => {
  it('same scenario and time produce identical journal and projections', async () => {
    // invariant: two independent start() calls with identical seed produce identical journal shapes
    // non-goal: wall-clock timestamps from DeterministicTaskExecutor internals are not compared
    const scenario = ReviewScenario.fixed({
      runId: 'run-deterministic',
      mrsInput: [FIXTURE_INPUT],
      seedEvents: [
        { ts: '2026-01-01T00:00:00Z', mr: 'test/proj!1', kind: 'system' },
        { ts: '2026-01-01T00:01:00Z', mr: 'test/proj!1', kind: 'task_created' },
      ],
    });

    // #region START_DETERMINISTIC_START_BOTH
    const rt1 = scenario.start({ initialInstant: '2026-01-01T00:00:00.000Z' });
    const rt2 = scenario.start({ initialInstant: '2026-01-01T00:00:00.000Z' });
    // #endregion END_DETERMINISTIC_START_BOTH

    // drain microtask queue so the void-seeding promise chains inside start() complete
    await new Promise<void>((resolve) => setImmediate(resolve));

    // #region START_DETERMINISTIC_ASSERT_JOURNALS
    const j1 = rt1.journal.read();
    const j2 = rt2.journal.read();
    assert.strictEqual(j1.length, 2, 'run1 journal has both seed events');
    assert.strictEqual(j2.length, 2, 'run2 journal has both seed events');
    assert.deepStrictEqual(
      j1.map((e) => ({ mr: e.mr, kind: e.kind, seq: e.seq })),
      j2.map((e) => ({ mr: e.mr, kind: e.kind, seq: e.seq })),
      'journal entry shapes are identical across both runs'
    );
    // #endregion END_DETERMINISTIC_ASSERT_JOURNALS

    const p1 = rt1.projection.board();
    const p2 = rt2.projection.board();
    assert.deepStrictEqual(p1, p2, 'projection board is identical across both runs');
  });

  it('foreign reset network and production filesystem access are denied', async () => {
    // contract: mock namespace profile denies resetBoundTestRun unconditionally;
    //           test namespace profile denies reset with a foreign run-id;
    //           MockVcsAdapter has no production host and unseeded reads fail loudly
    // non-goal: verifying filesystem deletion — MockRuntimeProfile has no filesystem access

    // Mock namespace profile: reset denied regardless of matching run-id
    const mockProfile = MockRuntimeProfile.forMockRun('run-A');
    await assert.rejects(
      () => mockProfile.resetBoundTestRun('run-A'),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /\[MockRuntimeProfile#resetBoundTestRun\] Reset denied/);
        return true;
      },
      'mock namespace profile denies resetBoundTestRun even with matching run-id'
    );

    // Test namespace profile: reset denied when run-id does not match
    // #region START_ISOLATION_TEST_NAMESPACE_SETUP
    const testProfile = new MockRuntimeProfile();
    await testProfile.openProfile(
      ReviewRuntimeProfile.compose({
        stateNamespace: 'test',
        externalIoPolicy: 'real-readonly',
        runId: 'run-T',
      })
    );
    // #endregion END_ISOLATION_TEST_NAMESPACE_SETUP

    await assert.rejects(
      () => testProfile.resetBoundTestRun('run-other'),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /\[MockRuntimeProfile#resetBoundTestRun\] Reset denied/);
        return true;
      },
      'test namespace profile denies reset with foreign run-id'
    );

    // Test namespace with matching run-id succeeds (proves the above failures are ID-specific)
    await testProfile.resetBoundTestRun('run-T');

    // Production access: MockVcsAdapter exposes no host and fails on unseeded reads
    const { vcs } = createScenario('run-net-isolation').start();
    assert.strictEqual(vcs.getHost(), '', 'MockVcsAdapter has no production host');
    await assert.rejects(
      () => vcs.getMrDetail('unknown/project', '999'),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /\[MockVcsAdapter#getMrDetail\] Unseeded MR/);
        return true;
      },
      'unseeded getMrDetail fails loudly without network fallback'
    );
  });

  it('crash recovery and ambiguous effect reconciliation follow distinct paths', async () => {
    // contract: crash recovery (new executor from same journal) re-queues running tasks;
    //           ambiguous claim (running task present) resolves to empty after complete()
    // invariant: the two paths diverge — crash re-queues for retry; ambiguous waits for completion

    // Crash recovery path
    // #region START_RECOVERY_CRASH_SETUP
    const journal = new InMemoryJournalAdapter();
    const executorPre = new DeterministicTaskExecutor(journal);
    const task = {
      taskId: 'task-recovery-1',
      kind: 'review',
      mr: 'test/proj!1',
      status: 'queued' as const,
      priority: 50,
      dependsOn: [] as readonly string[],
      dedupKey: 'review:test/proj!1',
      params: {},
      provenance: { createdBy: 'crash-test', createdAt: '2026-01-01T00:00:00Z' },
    };
    await executorPre.enqueue(task);
    const claimedPre = await executorPre.claim('test/proj!1');
    // #endregion END_RECOVERY_CRASH_SETUP

    assert.equal(claimedPre.claimed, true, 'pre-crash claim succeeds');
    assert.equal(
      executorPre.progress('test/proj!1').running,
      1,
      'task running before simulated crash'
    );

    // Simulate crash: new executor backed by the same journal (models process restart)
    const executorPost = new DeterministicTaskExecutor(journal);
    await executorPost.recover('test/proj!1');

    // #region START_RECOVERY_ASSERT_REQUEUE
    assert.deepStrictEqual(
      {
        queued: executorPost.progress('test/proj!1').queued,
        running: executorPost.progress('test/proj!1').running,
      },
      { queued: 1, running: 0 },
      'running task is re-queued; no tasks remain in running state after recovery'
    );
    // #endregion END_RECOVERY_ASSERT_REQUEUE

    const claimedPost = await executorPost.claim('test/proj!1');
    assert.equal(
      claimedPost.claimed,
      true,
      'claim succeeds after crash recovery — task is claimable again'
    );

    // Ambiguous effect reconciliation path — distinct from crash recovery
    // #region START_AMBIGUOUS_RECONCILE_SETUP
    const journalAmb = new InMemoryJournalAdapter();
    const executorAmb = new DeterministicTaskExecutor(journalAmb);
    const taskAmb = {
      taskId: 'task-ambiguous-1',
      kind: 'review',
      mr: 'test/proj!2',
      status: 'queued' as const,
      priority: 50,
      dependsOn: [] as readonly string[],
      dedupKey: 'review:test/proj!2',
      params: {},
      provenance: { createdBy: 'ambiguous-test', createdAt: '2026-01-01T00:00:00Z' },
    };
    await executorAmb.enqueue(taskAmb);
    await executorAmb.claim('test/proj!2');
    // #endregion END_AMBIGUOUS_RECONCILE_SETUP

    const ambiguousClaim = await executorAmb.claim('test/proj!2');
    assert.deepStrictEqual(
      ambiguousClaim,
      { claimed: false, reason: 'ambiguous' },
      'second claim while task running returns ambiguous'
    );

    // Reconcile: complete the running task; next claim reflects empty lane — not ambiguous
    await executorAmb.complete('test/proj!2', taskAmb.taskId, 'done');
    const reconciledClaim = await executorAmb.claim('test/proj!2');
    assert.deepStrictEqual(
      reconciledClaim,
      { claimed: false, reason: 'empty' },
      'after complete() lane is empty — reconciliation resolves distinct from crash re-queue path'
    );
  });
});
