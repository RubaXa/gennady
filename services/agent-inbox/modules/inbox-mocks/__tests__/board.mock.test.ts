// @file: Unit tests for board.mock factory — type validation for mockBoard.
// @consumers: node:test runner
// @tasks: TSK-105

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockBoard } from '../board.mock.ts';
import { mockActionableMr } from '../mr.mock.ts';
import type { Board } from '../board.mock.ts';

describe('mockBoard — default values', () => {
  it('GIVEN no overrides WHEN mockBoard() THEN returns Board with default reviewer role and empty lanes', () => {
    const board: Board = mockBoard();

    assert.strictEqual(board.roles.length, 1);
    assert.strictEqual(board.roles[0].name, 'reviewer');
    assert.strictEqual(board.roles[0].active, true);
    assert.deepStrictEqual(board.roles[0].lanes.inbox, []);
    assert.deepStrictEqual(board.roles[0].lanes.inProgress, []);
    assert.deepStrictEqual(board.roles[0].lanes.awaitingMe, []);
    assert.deepStrictEqual(board.roles[0].lanes.done, []);
    assert.deepStrictEqual(board.unassigned, []);
  });

  it('GIVEN overrides with roles WHEN mockBoard THEN roles applied correctly', () => {
    const mr1 = mockActionableMr({ iid: 510 });
    const mr2 = mockActionableMr({ iid: 511 });

    const board = mockBoard({
      roles: [
        {
          name: 'reviewer',
          active: true,
          lanes: {
            inbox: [mr1, mr2],
            inProgress: [],
            awaitingMe: [],
            done: [],
          },
        },
        {
          name: 'author',
          active: false,
          lanes: {
            inbox: [],
            inProgress: [],
            awaitingMe: [],
            done: [],
          },
        },
      ],
      unassigned: [mockActionableMr({ iid: 512 })],
    });

    assert.strictEqual(board.roles.length, 2);
    assert.strictEqual(board.roles[0].name, 'reviewer');
    // contract: BDD — roles[0].lanes.inbox содержит 2 карточки
    assert.strictEqual(board.roles[0].lanes.inbox.length, 2);
    assert.strictEqual(board.roles[0].lanes.inbox[0].iid, 510);
    assert.strictEqual(board.roles[0].lanes.inbox[1].iid, 511);
    assert.strictEqual(board.roles[1].name, 'author');
    assert.strictEqual(board.roles[1].active, false);
    assert.strictEqual(board.unassigned.length, 1);
    assert.strictEqual(board.unassigned[0].iid, 512);
  });

  it('GIVEN partial overrides WHEN mockBoard THEN unprovided fields use defaults', () => {
    const board = mockBoard({
      unassigned: [mockActionableMr({ project: 'team/tools', iid: 700 })],
    });

    assert.strictEqual(board.roles.length, 1);
    assert.strictEqual(board.roles[0].name, 'reviewer');
    assert.strictEqual(board.unassigned.length, 1);
    assert.strictEqual(board.unassigned[0].project, 'team/tools');
  });
});
