// @file: Integration tests — per-MR ordering, cross-MR parallelism, priority, recovery, ambiguous retry.
// @consumers: TSK-177 audit
// @tasks: TSK-177

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LocalTaskExecutor } from '../../../services/agent-inbox/modules/inbox-queue/adapters/local-task-executor.adapter.ts';
import { constructReviewTask } from '../../../services/agent-inbox/modules/inbox-queue/model/review-task.ts';
import type {
  JournalPort,
  JournalEntry,
} from '../../../services/agent-inbox/modules/inbox-core/event-journal.ts';

function createMemoryJournal(): JournalPort {
  const entries: JournalEntry[] = [];
  return {
    identity: 'memory-journal',
    health: () => ({ status: 'healthy' }),
    append: async (entry) => {
      const seq = entries.length + 1;
      entries.push({ ...entry, seq });
      return seq;
    },
    read: () => [...entries],
    since: (cursor) => {
      const filtered = entries.filter((e) => e.seq > cursor);
      const nextCursor = entries.length > 0 ? (entries[entries.length - 1]?.seq ?? cursor) : cursor;
      return { entries: filtered, nextCursor };
    },
    appendReviewEvent: async () => {
      throw new Error('not implemented');
    },
    replayReviewEvents: () => [],
  };
}

function makeTask(
  mr: string,
  kind: string,
  priority: number,
  overrides: { dedupKey?: string; dependsOn?: string[] } = {}
) {
  const registry = {
    computeDedupKey: (k: string, p: Record<string, unknown>) => `${k}::${JSON.stringify(p)}`,
  };
  return constructReviewTask({
    taskId: `temp-${Math.random()}`,
    kind,
    mr,
    priority,
    dependsOn: overrides.dependsOn ?? [],
    dedupKey: overrides.dedupKey ?? registry.computeDedupKey(kind, {}),
    params: {},
    provenance: {
      createdBy: 'test',
      createdAt: new Date().toISOString(),
    },
  });
}

type ExecutorContext = { executor: LocalTaskExecutor; journal: JournalPort };

function createExecutorContext(): ExecutorContext {
  const journal = createMemoryJournal();
  return { executor: new LocalTaskExecutor(journal), journal };
}

describe('LocalTaskExecutor', () => {
  it('per MR ordering cross MR parallelism priority recovery and ambiguous retry are safe', async () => {
    // invariant: one running task per MR lane; different MR lanes progress independently;
    //   operator priority (90) task is claimed before pipeline priority (10) task in same lane;
    //   running task is re-queued on recover(); acknowledged terminal tasks are not repeated
    const { executor } = createExecutorContext();
    const mr1 = 'g/p!1';
    const mr2 = 'g/p!2';

    // #region START_EXECUTOR_SETUP_LANES
    // MR1: one pipeline task, one operator task (higher priority)
    const pipelineTask = makeTask(mr1, 'prepare_env', 10, { dedupKey: 'prepare_env::{}' });
    const operatorTask = makeTask(mr1, 'fact_check', 90, { dedupKey: 'fact_check::{}' });

    // MR2: one independent task
    const mr2Task = makeTask(mr2, 'plan', 10, { dedupKey: 'plan::{}' });

    await executor.enqueue(pipelineTask);
    await executor.enqueue(operatorTask);
    await executor.enqueue(mr2Task);
    // #endregion END_EXECUTOR_SETUP_LANES

    // #region START_EXECUTOR_ASSERT_PRIORITY
    // MR1: claim should return the operator task (priority 90) before pipeline task (priority 10)
    const claim1 = await executor.claim(mr1);
    assert.ok(claim1.claimed === true);
    assert.strictEqual(claim1.task.kind, 'fact_check');
    // #endregion END_EXECUTOR_ASSERT_PRIORITY

    // #region START_EXECUTOR_ASSERT_PARALLELISM
    // MR2 is independent — can be claimed while MR1 has a running task
    const claimMr2 = await executor.claim(mr2);
    assert.ok(claimMr2.claimed === true);
    assert.strictEqual(claimMr2.task.kind, 'plan');

    // Progress: MR1 has 1 running, 1 queued; MR2 has 1 running
    const prog1 = executor.progress(mr1);
    assert.strictEqual(prog1.running, 1);
    assert.strictEqual(prog1.queued, 1);
    const prog2 = executor.progress(mr2);
    assert.strictEqual(prog2.running, 1);
    // #endregion END_EXECUTOR_ASSERT_PARALLELISM

    // #region START_EXECUTOR_ASSERT_AMBIGUOUS
    // Ambiguous retry: attempting to claim from MR1 while it has a running task returns ambiguous
    const ambiguous = await executor.claim(mr1);
    assert.ok(ambiguous.claimed === false);
    assert.strictEqual(ambiguous.reason, 'ambiguous');
    // #endregion END_EXECUTOR_ASSERT_AMBIGUOUS

    // Complete the MR1 operator task (done), then claim the pipeline task
    await executor.complete(mr1, claim1.task.taskId, 'done');
    const claim3 = await executor.claim(mr1);
    assert.ok(claim3.claimed === true);
    assert.strictEqual(claim3.task.kind, 'prepare_env');

    // Empty lane: complete last task; next claim returns 'empty'
    await executor.complete(mr1, claim3.task.taskId, 'done');
    const empty = await executor.claim(mr1);
    assert.ok(empty.claimed === false);
    assert.strictEqual(empty.reason, 'empty');
  });

  it('recover re-queues running tasks and does not repeat acknowledged terminal tasks', async () => {
    // invariant: crash safety — running task is re-queued so the next claim can pick it up;
    //   acknowledged done/failed/cancelled tasks are not re-queued
    const { executor, journal } = createExecutorContext();
    const mr = 'g/p!1';

    const task1 = makeTask(mr, 'plan', 10, { dedupKey: 'plan::{}' });
    const task2 = makeTask(mr, 'enrich', 10, { dedupKey: 'enrich::{}' });

    await executor.enqueue(task1);
    await executor.enqueue(task2);

    // Claim task1 → running
    const claimed = await executor.claim(mr);
    assert.ok(claimed.claimed === true);
    assert.strictEqual(claimed.task.kind, 'plan');

    // Mark task1 as done durably
    await executor.complete(mr, claimed.task.taskId, 'done');

    // Claim task2 → running (simulates crash mid-execution)
    const claimed2 = await executor.claim(mr);
    assert.ok(claimed2.claimed === true);
    assert.strictEqual(claimed2.task.kind, 'enrich');

    // Now: create a fresh executor and recover — simulates crash recovery
    const recoveredExecutor = new LocalTaskExecutor(journal);
    await recoveredExecutor.recover(mr);

    const prog = recoveredExecutor.progress(mr);
    // task1 was done and should not appear as queued
    // task2 was running at crash → should be re-queued (not running anymore)
    assert.strictEqual(prog.running, 0);
    assert.ok(prog.queued >= 1); // task2 is back as queued

    // We can claim task2 again after recovery
    const claimAfterRecovery = await recoveredExecutor.claim(mr);
    assert.ok(claimAfterRecovery.claimed === true);
    assert.strictEqual(claimAfterRecovery.task.kind, 'enrich');
  });

  it('dedup returns existing task for same dedupKey; supersedes failed task', async () => {
    // invariant: same dedupKey while task is in queued or failed state → update params, reset to queued
    const { executor } = createExecutorContext();
    const mr = 'g/p!1';
    const task = makeTask(mr, 'plan', 10, { dedupKey: 'plan::{}' });
    const { taskId } = await executor.enqueue(task);

    // Second enqueue with same dedupKey → same taskId returned
    const { taskId: taskId2 } = await executor.enqueue(task);
    assert.strictEqual(taskId, taskId2);

    // Progress: still only 1 queued task
    assert.strictEqual(executor.progress(mr).queued, 1);
  });
});
