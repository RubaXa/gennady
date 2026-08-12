// @file: Unit tests for ghost-todo cleanup planning and bounded marking.
// @consumers: node:test runner
// @tasks: TSK-174

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planTodoCleanup, markTodosDone } from './cleanup-todos.logic.ts';
import type { PendingMrTodo } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-inbox.ts';

const todo = (id: string, state: PendingMrTodo['targetState']): PendingMrTodo => ({
  todoId: id,
  targetState: state,
  project: 'g/p',
  iid: id,
  webUrl: `https://gitlab.test/g/p/-/merge_requests/${id}`,
});

describe('planTodoCleanup', () => {
  it('selects only merged/closed targets as ghosts and never an open MR', () => {
    const plan = planTodoCleanup([
      todo('1', 'opened'),
      todo('2', 'merged'),
      todo('3', 'closed'),
      todo('4', 'opened'),
      todo('5', 'merged'),
    ]);
    assert.strictEqual(plan.total, 5);
    assert.strictEqual(plan.openedCount, 2);
    assert.deepStrictEqual(
      plan.ghosts.map((g) => g.todoId),
      ['2', '3', '5']
    );
    assert.ok(
      plan.ghosts.every((g) => g.targetState !== 'opened'),
      'no open-MR todo may be selected'
    );
  });

  it('yields an empty ghost set when every target is open', () => {
    const plan = planTodoCleanup([todo('1', 'opened'), todo('2', 'opened')]);
    assert.strictEqual(plan.ghosts.length, 0);
    assert.strictEqual(plan.openedCount, 2);
  });
});

describe('markTodosDone', () => {
  it('marks every id through the injected mutator and counts successes', async () => {
    const marked: string[] = [];
    const result = await markTodosDone(
      async (id) => {
        marked.push(id);
      },
      ['a', 'b', 'c', 'd'],
      2
    );
    assert.deepStrictEqual(result, { marked: 4, failed: 0 });
    assert.deepStrictEqual(marked.sort(), ['a', 'b', 'c', 'd']);
  });

  it('counts a rejected mutation as a failure without aborting the batch', async () => {
    const result = await markTodosDone(
      async (id) => {
        if (id === 'b') throw new Error('boom');
      },
      ['a', 'b', 'c'],
      3
    );
    assert.deepStrictEqual(result, { marked: 2, failed: 1 });
  });

  it('is a no-op for an empty batch', async () => {
    let called = 0;
    const result = await markTodosDone(async () => {
      called++;
    }, []);
    assert.deepStrictEqual(result, { marked: 0, failed: 0 });
    assert.strictEqual(called, 0);
  });
});
