import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyMove, status, render } from '../src/game.ts';

test('move on empty cell places mark and passes turn', () => {
  const g = applyMove(createGame(), 4);
  assert.equal(g.board[4], 'X');
  assert.equal(g.turn, 'O');
});

test('move on occupied cell is rejected', () => {
  const g = applyMove(createGame(), 4);
  assert.throws(() => applyMove(g, 4), /occupied/);
  assert.equal(g.board[4], 'X');
});

test('move out of range is rejected', () => {
  assert.throws(() => applyMove(createGame(), 9), /range/);
});

test('completed line reports the winner', () => {
  let g = createGame();
  g = applyMove(g, 0); // X
  g = applyMove(g, 3); // O
  g = applyMove(g, 1); // X
  g = applyMove(g, 4); // O
  g = applyMove(g, 2); // X wins top row
  assert.deepEqual(status(g), { kind: 'win', winner: 'X' });
});

test('full board with no line reports a draw', () => {
  const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'] as const;
  assert.deepEqual(status({ board: [...board], turn: 'X' }), { kind: 'draw' });
});

test('public API has the declared shape', () => {
  assert.equal(typeof createGame, 'function');
  assert.equal(typeof applyMove, 'function');
  assert.equal(typeof status, 'function');
  assert.equal(typeof render, 'function');
  assert.ok('kind' in status(createGame()));
  assert.equal(typeof render(createGame()), 'string');
});
