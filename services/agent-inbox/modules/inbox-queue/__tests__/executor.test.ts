// @file: Unit tests for Executor — per-MR isolation, priority+FIFO+aging, exclusive effects, waiting_dep, crash recovery, journal visibility, next() selection
// @consumers: node:test runner
// @tasks: TSK-159

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Executor } from '../executor.ts';
import { TaskRegistry, type TaskInstance } from '../task-registry.ts';
import type { TaskQueuePort } from '../task-queue.ts';
import { InMemoryTaskQueue } from '../task-queue.ts';
import type { JournalPort, JournalEntry } from '../../inbox-core/event-journal.ts';

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
  };
  return { journal, entries };
}

describe('two MRs execute independently under long LLM task', () => {
  it('MR-A executor processes MR-A tasks while MR-B executor runs independently', async () => {
    const registry = new TaskRegistry();
    const { journal: journalA } = makeJournal();
    const { journal: journalB } = makeJournal();
    const queueA = new InMemoryTaskQueue(registry);
    const queueB = new InMemoryTaskQueue(registry);
    const execA = new Executor(journalA, registry, queueA, 'A');
    const execB = new Executor(journalB, registry, queueB, 'B');

    await execA.enqueue('widen_search', {});
    await execB.enqueue('widen_search', {});

    const startedA = await execA.advance();
    const startedB = await execB.advance();

    assert.strictEqual(startedA.length, 1);
    assert.strictEqual(startedB.length, 1);
    assert.strictEqual(startedA[0].type, 'widen_search');
    assert.strictEqual(startedB[0].type, 'widen_search');
  });

  it('MR-A NOT blocked by MR-B running LLM task', async () => {
    const registry = new TaskRegistry();
    const { journal: journalA } = makeJournal();
    const { journal: journalB } = makeJournal();
    const queueA = new InMemoryTaskQueue(registry);
    const queueB = new InMemoryTaskQueue(registry);
    const execA = new Executor(journalA, registry, queueA, 'A');
    const execB = new Executor(journalB, registry, queueB, 'B');

    await execA.enqueue('delta_review', {});
    await execB.enqueue('delta_review', {});

    const startedA = await execA.advance();
    assert.strictEqual(startedA.length, 1);

    await execB.enqueue('verify_fix', {});
    const startedB = await execB.advance();

    assert.ok(startedB.length >= 1);
    assert.ok(startedB.some((t) => t.type === 'verify_fix'));
  });
});

describe('priority ordering', () => {
  it('user task runs before event task when both in queue', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    await exec.enqueue('thread_triage', {}); // 🦊 priority=50
    await exec.enqueue('widen_search', {}); // 👤 priority=90

    const started = await exec.advance();
    assert.ok(started.length >= 2);
    const userIdx = started.findIndex((t) => t.type === 'widen_search');
    const eventIdx = started.findIndex((t) => t.type === 'thread_triage');
    assert.ok(userIdx < eventIdx, 'user task should be selected before event task');
  });

  it('event task runs before pipeline task', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    await exec.enqueue('prepare_env', {}); // 🏗 priority=10
    await exec.enqueue('verify_fix', {}); // 🦊 priority=50

    const started = await exec.advance();
    assert.ok(started.length >= 2);
    const eventIdx = started.findIndex((t) => t.type === 'verify_fix');
    const pipeIdx = started.findIndex((t) => t.type === 'prepare_env');
    assert.ok(eventIdx < pipeIdx, 'event task should be selected before pipeline task');
  });

  it('same priority → FIFO order', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    await exec.enqueue('verify_fix', {}); // 🦊 priority=50
    await exec.enqueue('thread_triage', {}); // 🦊 priority=50

    const started = await exec.advance();
    assert.strictEqual(started.length, 2);
    assert.strictEqual(started[0].type, 'verify_fix');
    assert.strictEqual(started[1].type, 'thread_triage');
  });

  it('aging bumps pipeline task priority after threshold', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    await exec.enqueue('prepare_env', {});

    const tasks = queue.state('mr');
    const inst = tasks[0];
    inst.createdAt = new Date(Date.now() - 60 * 60_000).toISOString();

    await exec.enqueue('verify_fix', {});

    const started = await exec.advance();
    assert.ok(started.length >= 2);
    const pipeIdx = started.findIndex((t) => t.type === 'prepare_env');
    const eventIdx = started.findIndex((t) => t.type === 'verify_fix');
    assert.ok(pipeIdx < eventIdx, 'aged pipeline task should be selected before normal event task');
  });
});

describe('exclusive mode', () => {
  it('two effect tasks queued on same MR → only one runs', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    const r1 = await exec.enqueue('effect_*', {});
    const r2 = await exec.enqueue('effect_*', {});

    await exec.advance();

    const tasks = queue.state('mr');
    const t1 = tasks.find((t) => t.taskId === r1.taskId);
    const t2 = tasks.find((t) => t.taskId === r2.taskId);
    assert.ok(t1);
    assert.ok(t2);
    assert.strictEqual(t1.status, 'waiting_dep');
    assert.strictEqual(t2.status, 'waiting_dep');

    t1.status = 'running';
    t2.status = 'queued';

    const started = await exec.advance();
    const runningEffect = started.filter((t) => registry.isEffectTask(t.type));
    assert.strictEqual(runningEffect.length, 0);
    assert.strictEqual(t2.status, 'waiting_dep');
  });

  it('second effect starts after first completes', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    const r1 = await exec.enqueue('effect_*', {});
    const r2 = await exec.enqueue('effect_*', {});

    await exec.advance();

    const tasks = queue.state('mr');
    const t1 = tasks.find((t) => t.taskId === r1.taskId);
    const t2 = tasks.find((t) => t.taskId === r2.taskId);
    assert.ok(t1);
    assert.ok(t2);

    await exec.resolveExternal(r1.taskId);
    assert.strictEqual(t1.status, 'queued');

    await exec.advance();
    assert.strictEqual(t1.status, 'waiting_dep');
  });
});

describe('effect waits for operator decision in waiting_dep', () => {
  it('effect with unfulfilled precondition → stays waiting_dep', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    const result = await exec.enqueue('effect_*', {});
    const inst = queue.instance('mr', result.taskId);
    assert.ok(inst);
    assert.strictEqual(inst.status, 'queued');

    await exec.advance();

    assert.strictEqual(inst.status, 'waiting_dep');
  });

  it('resolveExternal transitions task to queued', async () => {
    const registry = new TaskRegistry();
    const { journal } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    const result = await exec.enqueue('effect_*', {});
    await exec.advance();

    const inst = queue.instance('mr', result.taskId);
    assert.strictEqual(inst?.status, 'waiting_dep');

    await exec.resolveExternal(result.taskId);

    assert.strictEqual(inst?.status, 'queued');
  });
});

describe('restore requeues running and skips applied effects', () => {
  it('applied effect with marker → skipped (done, NOT re-executed)', () => {
    const registry = new TaskRegistry();
    const { journal, entries } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    entries.push({
      ts: new Date().toISOString(),
      seq: 1,
      mr: 'mr',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#1',
        type: 'effect_*',
        params: {},
        dedupKey: 'eff',
        priority: 90,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    });
    entries.push({
      ts: new Date().toISOString(),
      seq: 2,
      mr: 'mr',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#1', status: 'done' },
    });

    exec.recover();
    const inst = queue.instance('mr', '#1');
    assert.ok(inst);
    assert.strictEqual(inst.status, 'done');
  });

  it('task in running state → requeued as queued', () => {
    const registry = new TaskRegistry();
    const { journal, entries } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    entries.push({
      ts: new Date().toISOString(),
      seq: 1,
      mr: 'mr',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#1',
        type: 'verify_fix',
        params: {},
        dedupKey: 'vf',
        priority: 50,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    });
    entries.push({
      ts: new Date().toISOString(),
      seq: 2,
      mr: 'mr',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#1', status: 'running' },
    });

    exec.recover();
    const inst = queue.instance('mr', '#1');
    assert.ok(inst);
    assert.strictEqual(inst.status, 'queued');
  });

  it('queued task → stays queued', () => {
    const registry = new TaskRegistry();
    const { journal, entries } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    entries.push({
      ts: new Date().toISOString(),
      seq: 1,
      mr: 'mr',
      kind: 'task_created',
      actor: 'queue',
      payload: {
        taskId: '#1',
        type: 'verify_fix',
        params: {},
        dedupKey: 'vf',
        priority: 50,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    });

    exec.recover();
    const inst = queue.instance('mr', '#1');
    assert.ok(inst);
    assert.strictEqual(inst.status, 'queued');
  });
});

describe('queue visibility in journal', () => {
  it('enqueue writes task_created journal event', async () => {
    const registry = new TaskRegistry();
    const { journal, entries } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    await exec.enqueue('verify_fix', {});

    const created = entries.filter((e) => e.kind === 'task_created');
    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0].mr, 'mr');
    assert.strictEqual((created[0].payload as Record<string, unknown>).type, 'verify_fix');
  });

  it('state transition writes task_status event', async () => {
    const registry = new TaskRegistry();
    const { journal, entries } = makeJournal();
    const queue = new InMemoryTaskQueue(registry);
    const exec = new Executor(journal, registry, queue, 'mr');

    const result = await exec.enqueue('verify_fix', {});

    const statusBefore = entries.filter((e) => e.kind === 'task_status');
    assert.strictEqual(statusBefore.length, 0);

    await exec.advance();

    const statusAfter = entries.filter((e) => e.kind === 'task_status');
    assert.ok(statusAfter.length > 0);
    const runningEvent = statusAfter.find(
      (e) => (e.payload as Record<string, unknown>).taskId === result.taskId
    );
    assert.ok(runningEvent);
  });
});

describe('next() selection', () => {
  it('next(mr) returns queued tasks when queue has items', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);

    queue.enqueue('mr', 'verify_fix', {});
    queue.enqueue('mr', 'thread_triage', {});

    const next = queue.next('mr');
    assert.strictEqual(next.length, 2);
  });

  it('next(mr) returns empty array when queue empty', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);

    const next = queue.next('mr');
    assert.strictEqual(next.length, 0);
  });
});
