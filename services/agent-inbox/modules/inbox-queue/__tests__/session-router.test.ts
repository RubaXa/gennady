// @file: Unit tests for SessionRouter — routing table §4.2 (deepen/fact_check/mutate/chat_question), engine passthrough, reuse_producer caching
// @consumers: node:test runner
// @tasks: TSK-159

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TaskRegistry, type TaskInstance } from '../task-registry.ts';
import { SessionRouter } from '../session-router.ts';
import type { SessionPool } from '../../inbox-opencode/session-pool.ts';

function makeTask(type: string, overrides?: Partial<TaskInstance>): TaskInstance {
  return {
    taskId: '#1',
    type,
    status: 'queued',
    params: {},
    dependsOn: [],
    dedupKey: 'dk',
    priority: 90,
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRouter(): { router: SessionRouter; createFn: ReturnType<typeof mock.fn> } {
  const createFn = mock.fn(async () => `session-${Math.random().toString(36).slice(2)}`);
  const mockPool = { create: createFn } as unknown as SessionPool;
  const registry = new TaskRegistry();
  const router = new SessionRouter(mockPool, registry);
  return { router, createFn };
}

describe('session routing table is honored', () => {
  it('deepen → reuse_producer (creates new session)', async () => {
    const { router, createFn } = makeRouter();
    const task = makeTask('deepen');
    const sid = await router.route(task, 'mr1');
    assert.ok(typeof sid === 'string');
    assert.strictEqual(createFn.mock.callCount(), 1);
  });

  it('deepen → reuse_producer (reuses existing session)', async () => {
    const { router, createFn } = makeRouter();
    const task1 = makeTask('deepen');
    const sid1 = await router.route(task1, 'mr1');
    const task2 = makeTask('deepen', { taskId: '#2' });
    const sid2 = await router.route(task2, 'mr1');

    assert.strictEqual(sid2, sid1);
    assert.strictEqual(createFn.mock.callCount(), 1);
  });

  it('fact_check → new_fresh (always creates new session)', async () => {
    const { router, createFn } = makeRouter();
    const task1 = makeTask('fact_check');
    const sid1 = await router.route(task1, 'mr1');
    const task2 = makeTask('fact_check', { taskId: '#2' });
    const sid2 = await router.route(task2, 'mr1');

    assert.notStrictEqual(sid2, sid1);
    assert.strictEqual(createFn.mock.callCount(), 2);
  });

  it('mutate_artifact → reuse_producer', async () => {
    const { router, createFn } = makeRouter();
    const task1 = makeTask('mutate_artifact');
    const sid1 = await router.route(task1, 'mr1');
    const task2 = makeTask('mutate_artifact', { taskId: '#2' });
    const sid2 = await router.route(task2, 'mr1');

    assert.strictEqual(sid2, sid1);
    assert.strictEqual(createFn.mock.callCount(), 1);
  });

  it('chat_question → operator_chat (per-MR singleton)', async () => {
    const { router, createFn } = makeRouter();
    const task1 = makeTask('chat_question');
    const sid1 = await router.route(task1, 'mr1');
    const task2 = makeTask('chat_question', { taskId: '#2' });
    const sid2 = await router.route(task2, 'mr1');

    assert.strictEqual(sid2, sid1);
    assert.strictEqual(createFn.mock.callCount(), 1);
  });

  it('engine task → returns undefined (passthrough)', async () => {
    const { router, createFn } = makeRouter();
    const task = makeTask('prepare_env');
    const sid = await router.route(task, 'mr1');

    assert.strictEqual(sid, undefined);
    assert.strictEqual(createFn.mock.callCount(), 0);
  });
});

describe('session routing edge cases', () => {
  it('reuse_producer with no alive producer session → creates new fresh', async () => {
    const { router, createFn } = makeRouter();
    const task = makeTask('deepen');
    const sid = await router.route(task, 'mr1');

    assert.ok(typeof sid === 'string');
    assert.strictEqual(createFn.mock.callCount(), 1);
  });

  it('reuse_producer with alive session → returns existing sessionId', async () => {
    const { router, createFn } = makeRouter();
    const task1 = makeTask('deepen');
    const sid1 = await router.route(task1, 'mr1');
    const task2 = makeTask('deepen', { taskId: '#2' });
    const sid2 = await router.route(task2, 'mr1');

    assert.strictEqual(sid2, sid1);
    assert.strictEqual(createFn.mock.callCount(), 1);
  });
});
