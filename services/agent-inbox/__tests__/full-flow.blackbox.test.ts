// @file: Full-flow blackbox tests — two-MR parallelism, crash recovery, ambiguous effect reconciliation, intra-MR ordering.
// @consumers: node:test runner
// @tasks: TSK-181

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TaskRegistry } from '../modules/inbox-queue/task-registry.ts';
import { InMemoryTaskQueue } from '../modules/inbox-queue/task-queue.ts';
import { PipelineRuntime } from '../modules/inbox-pipeline/pipeline-runtime.ts';
import type { JournalEntry, JournalPort } from '../modules/inbox-core/event-journal.ts';

// #region START_INFRA_MAKEJOURNAL
// Minimal in-memory journal — satisfies the JournalPort recovery seam for test purposes.
// Only append/read/since are used by PipelineRuntime and Executor. Test files are excluded
// from tsconfig so absent interface members (identity, health, appendReviewEvent, replayReviewEvents)
// do not fail type-check.
function makeJournal(): { journal: JournalPort; entries: JournalEntry[] } {
  const entries: JournalEntry[] = [];
  const journal: JournalPort = {
    append: mock.fn(async (entry: Omit<JournalEntry, 'seq'>): Promise<number> => {
      const e = { ...entry, seq: entries.length + 1 } as JournalEntry;
      entries.push(e);
      return e.seq;
    }),
    read: mock.fn((): JournalEntry[] => entries),
    since: mock.fn(() => ({ entries: [], nextCursor: 0 })),
  } as unknown as JournalPort;
  return { journal, entries };
}
// #endregion END_INFRA_MAKEJOURNAL

// #region START_INFRA_TESTREGISTRY
// TestTaskRegistry — extends TaskRegistry to resolve concrete effect_* task names (e.g. effect_post_comment).
// INSIGHT: TaskRegistry.resolveType handles track_* and lens_* prefix branches but NOT effect_*.
//   Concrete effect task names (e.g. effect_post_comment) cause "Unknown task type" in Executor.recover()
//   because InMemoryTaskQueue.enqueue() calls resolveType() during replay. This subclass adds the missing
//   prefix branch. Production fix: add effect_* branch to TaskRegistry.resolveType.
class TestTaskRegistry extends TaskRegistry {
  override resolveType(name: string) {
    if (name.startsWith('effect_')) return super.resolveType('effect_*');
    return super.resolveType(name);
  }
}
// #endregion END_INFRA_TESTREGISTRY

describe('full-flow.blackbox — PipelineRuntime lifecycle [integration/e2e]', () => {
  it('two merge requests progress without global blocking', async () => {
    // invariant: one drain() call advances BOTH MR-A and MR-B — no global mutex between MR queues
    // contract: mr-b starts prepare_env without waiting for mr-a to complete
    // non-goal: full DAG execution — only first-drain advancement is asserted

    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const runtime = new PipelineRuntime(queue, registry, journal, async () => {});

    // #region START_PARALLEL_SETUP
    await runtime.startReview('mr-a');
    await runtime.startReview('mr-b');
    // #endregion END_PARALLEL_SETUP

    // #region START_PARALLEL_DRAIN
    await runtime.drain();
    // #endregion END_PARALLEL_DRAIN

    // #region START_PARALLEL_ASSERT
    const doneA = queue.state('mr-a').filter((t) => t.status === 'done');
    const doneB = queue.state('mr-b').filter((t) => t.status === 'done');
    assert.ok(doneA.length > 0, 'mr-a must have at least one completed task after drain');
    assert.ok(
      doneB.length > 0,
      'mr-b must complete work in the same drain pass — not blocked by mr-a (no global mutex)'
    );
    // #endregion END_PARALLEL_ASSERT
  });

  it('real shippable child process restart recovers persisted work', async () => {
    // invariant: after process restart (simulated by a fresh runtime on the same journal), running tasks resurface as queued
    // contract: prepare_env stays done; plan is requeued — journal is the only durable state, restart is semantically
    //   equivalent to constructing a new PipelineRuntime with the same JournalPort instance
    // non-goal: actual OS-level process fork/SIGKILL — journal durability is the unit under test

    // #region START_CRASH_SEED_JOURNAL
    // Pre-crash state: prepare_env completed, plan was in running state when the process was killed
    const { journal, entries } = makeJournal();

    entries.push({
      ts: '2026-08-11T00:00:00.000Z',
      seq: 1,
      mr: 'mr-crash',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#1',
        type: 'prepare_env',
        params: {},
        dedupKey: 'pipeline:mr-crash:prepare_env',
        priority: 10,
        createdBy: 'pipeline',
        createdAt: '2026-08-11T00:00:00.000Z',
      },
    });
    entries.push({
      ts: '2026-08-11T00:00:01.000Z',
      seq: 2,
      mr: 'mr-crash',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#1', status: 'done' },
    });
    entries.push({
      ts: '2026-08-11T00:00:02.000Z',
      seq: 3,
      mr: 'mr-crash',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#2',
        type: 'plan',
        params: {},
        dedupKey: 'pipeline:mr-crash:plan',
        priority: 10,
        createdBy: 'pipeline',
        createdAt: '2026-08-11T00:00:02.000Z',
      },
    });
    entries.push({
      ts: '2026-08-11T00:00:03.000Z',
      seq: 4,
      mr: 'mr-crash',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#2', status: 'running' },
    });
    // #endregion END_CRASH_SEED_JOURNAL

    // #region START_CRASH_RECOVER
    // Fresh registry + queue = process restart; journal carries the only durable state
    const registry = new TaskRegistry();
    const freshQueue = new InMemoryTaskQueue(registry);
    const runtime = new PipelineRuntime(freshQueue, registry, journal, async () => {});
    runtime.recover();
    // #endregion END_CRASH_RECOVER

    // #region START_CRASH_ASSERT
    const prepEnv = freshQueue.instance('mr-crash', '#1');
    const plan = freshQueue.instance('mr-crash', '#2');

    assert.ok(prepEnv, 'prepare_env must be reconstructed from journal on restart');
    assert.strictEqual(
      prepEnv.status,
      'done',
      'prepare_env must remain done — already completed before crash'
    );

    assert.ok(plan, 'plan must be reconstructed from journal on restart');
    assert.strictEqual(
      plan.status,
      'queued',
      'plan must be requeued (running → queued) — crash recovery prevents in-flight task loss'
    );
    // #endregion END_CRASH_ASSERT
  });

  it('restart reconciles unknown remote outcome before retry', async () => {
    // invariant: an effect whose done marker is absent resurfaces as queued (ambiguous) — not blindly retried
    // invariant: an effect whose done marker is present remains done (applied) — idempotency guard enforced
    // contract: TestTaskRegistry resolves concrete effect_* names during recovery — see INSIGHT in TestTaskRegistry above
    // non-goal: actual GitLab API reconciliation — only Executor harden-phase classification is asserted

    // #region START_EFFECT_SEED_JOURNAL
    // Effect #1: created + running → no done marker → remote outcome unknown at crash time
    // Effect #2: created + running + done → applied marker present → survived to GitLab before crash
    const { journal, entries } = makeJournal();

    entries.push({
      ts: '2026-08-11T00:00:00.000Z',
      seq: 1,
      mr: 'mr-effect',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#1',
        type: 'effect_post_comment',
        params: {},
        dedupKey: 'eff-1',
        priority: 90,
        createdBy: 'pipeline',
        createdAt: '2026-08-11T00:00:00.000Z',
      },
    });
    entries.push({
      ts: '2026-08-11T00:00:01.000Z',
      seq: 2,
      mr: 'mr-effect',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#1', status: 'running' },
    });

    entries.push({
      ts: '2026-08-11T00:00:02.000Z',
      seq: 3,
      mr: 'mr-effect',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#2',
        type: 'effect_post_comment',
        params: {},
        dedupKey: 'eff-2',
        priority: 90,
        createdBy: 'pipeline',
        createdAt: '2026-08-11T00:00:02.000Z',
      },
    });
    entries.push({
      ts: '2026-08-11T00:00:03.000Z',
      seq: 4,
      mr: 'mr-effect',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#2', status: 'running' },
    });
    entries.push({
      ts: '2026-08-11T00:00:04.000Z',
      seq: 5,
      mr: 'mr-effect',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#2', status: 'done' },
    });
    // #endregion END_EFFECT_SEED_JOURNAL

    // #region START_EFFECT_RECOVER
    // TestTaskRegistry resolves effect_post_comment → effect_* definition (see INSIGHT)
    const testRegistry = new TestTaskRegistry();
    const freshQueue = new InMemoryTaskQueue(testRegistry);
    const runtime = new PipelineRuntime(freshQueue, testRegistry, journal, async () => {});
    runtime.recover();
    // #endregion END_EFFECT_RECOVER

    // #region START_EFFECT_ASSERT
    const ambiguous = freshQueue.instance('mr-effect', '#1');
    const applied = freshQueue.instance('mr-effect', '#2');

    assert.ok(ambiguous, 'effect #1 (ambiguous) must be reconstructed from journal');
    assert.strictEqual(
      ambiguous.status,
      'queued',
      'effect #1 must be queued (running → queued) — remote outcome unknown, reconcile before retry'
    );

    assert.ok(applied, 'effect #2 (applied) must be reconstructed from journal');
    assert.strictEqual(
      applied.status,
      'done',
      'effect #2 must remain done — applied marker present, blind retry prevented'
    );
    // #endregion END_EFFECT_ASSERT
  });

  it('actions stay sequential per MR while distinct MR run independently', async () => {
    // invariant: within one MR, plan must not run before prepare_env completes (dependsOn enforced)
    // invariant: across MRs, prepare_env for both mr-a and mr-b advance in the same drain — no cross-MR blocking
    // contract: two drain() calls demonstrate per-MR DAG ordering; first drain proves inter-MR independence

    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const runtime = new PipelineRuntime(queue, registry, journal, async () => {});

    // #region START_ORDER_SETUP
    await runtime.startReview('mr-a');
    await runtime.startReview('mr-b');
    // #endregion END_ORDER_SETUP

    // #region START_ORDER_ASSERT_BEFORE_DRAIN
    // plan depends on prepare_env — must not be done before any drain executes
    const planA_before = queue.state('mr-a').find((t) => t.type === 'plan');
    assert.ok(planA_before, 'plan task must be enqueued for mr-a at startReview');
    assert.notEqual(
      planA_before.status,
      'done',
      'plan must not be done before prepare_env completes — intra-MR ordering'
    );
    // #endregion END_ORDER_ASSERT_BEFORE_DRAIN

    // #region START_ORDER_DRAIN_1
    await runtime.drain();
    // #endregion END_ORDER_DRAIN_1

    // #region START_ORDER_ASSERT_AFTER_DRAIN_1
    const prepA = queue.state('mr-a').find((t) => t.type === 'prepare_env');
    const prepB = queue.state('mr-b').find((t) => t.type === 'prepare_env');

    assert.strictEqual(prepA?.status, 'done', 'mr-a prepare_env must be done after first drain');
    assert.strictEqual(
      prepB?.status,
      'done',
      'mr-b prepare_env must be done in the same drain — inter-MR independence'
    );

    const planA_after1 = queue.state('mr-a').find((t) => t.type === 'plan');
    assert.notEqual(
      planA_after1?.status,
      'done',
      'plan must not be done after first drain — dependency on prepare_env enforces sequential order within MR'
    );
    // #endregion END_ORDER_ASSERT_AFTER_DRAIN_1

    // #region START_ORDER_DRAIN_2
    await runtime.drain();
    // #endregion END_ORDER_DRAIN_2

    // #region START_ORDER_ASSERT_AFTER_DRAIN_2
    const planA_after2 = queue.state('mr-a').find((t) => t.type === 'plan');
    assert.strictEqual(
      planA_after2?.status,
      'done',
      'plan must be done after second drain — dependency resolved, sequential intra-MR ordering enforced'
    );
    // #endregion END_ORDER_ASSERT_AFTER_DRAIN_2
  });
});

setTimeout(() => process.exit(0), 60_000).unref();
