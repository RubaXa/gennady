// @file: harness.mock.test — vertical slice: the whole orchestration + honest gate on MockAgent.
// @consumers: npm run harness:test
// @tasks: N/A (eval harness, not published)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, type Scenario } from '../core/harness.ts';
import { MockAgent, type MockTurn } from '../port/mock-agent.ts';

// Real, runnable tic-tac-toe the mock "agent" authors — zero deps, node:test.
const BOARD_JS = `'use strict';
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function emptyBoard() { return Array(9).fill(null); }
function move(board, index, player) {
  if (index < 0 || index > 8) throw new RangeError('index out of range');
  if (board[index] !== null) throw new Error('cell occupied');
  const next = board.slice();
  next[index] = player;
  return next;
}
function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}
function isDraw(board) { return winner(board) === null && board.every((c) => c !== null); }
module.exports = { emptyBoard, move, winner, isDraw, LINES };
`;

const BOARD_TEST_JS = `'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emptyBoard, move, winner, isDraw } = require('../src/board.js');

test('empty board has no winner', () => { assert.equal(winner(emptyBoard()), null); });
test('detects a row win', () => {
  const b = emptyBoard(); b[0] = b[1] = b[2] = 'X';
  assert.equal(winner(b), 'X');
});
test('detects a diagonal win', () => {
  const b = emptyBoard(); b[0] = b[4] = b[8] = 'O';
  assert.equal(winner(b), 'O');
});
test('move rejects an occupied cell', () => {
  const b = move(emptyBoard(), 4, 'X');
  assert.throws(() => move(b, 4, 'O'), /occupied/);
});
test('full board with no line is a draw', () => {
  assert.equal(isDraw(['X','O','X','X','O','O','O','X','X']), true);
});
`;

const PACKAGE_JSON = JSON.stringify(
  { name: 'tic-tac-toe', version: '1.0.0', private: true, scripts: { test: 'node --test' } },
  null,
  2
);

const scaffoldTurn: MockTurn = {
  text: 'scaffolded',
  writes: [{ path: 'package.json', content: PACKAGE_JSON }],
};
const executeTurn: MockTurn = {
  text: 'implemented + tested',
  writes: [
    { path: 'src/board.js', content: BOARD_JS },
    { path: 'test/board.test.js', content: BOARD_TEST_JS },
  ],
};

const s1Scenario: Scenario = {
  id: 's1',
  label: 'fixture',
  steps: [
    { label: 'scaffold', text: 'run sdd scaffold for tic-tac-toe' },
    { label: 'execute', text: 'run sdd execute' },
  ],
  expect: {
    requiredFiles: ['package.json', 'src/board.js', 'test/board.test.js'],
    writtenFiles: ['src/board.js', 'test/board.test.js'],
    testCommand: ['node', '--test'],
  },
};

test('S1 mock run: agent authors working tic-tac-toe → tests green → report ok', async () => {
  const agent = new MockAgent([scaffoldTurn, executeTurn]);
  const report = await runHarness(s1Scenario, agent);
  assert.equal(report.ok, true, JSON.stringify(report.verify.checks, null, 2));
  assert.ok(report.verify.checks.find((c) => c.name === 'tests')?.ok, 'node --test must pass');
  assert.ok(
    report.flow.steps.every((s) => s.ok),
    'every flow step must succeed'
  );
});

test('honest gate: broken code the agent authored still fails verification', async () => {
  const brokenTest = executeTurn.writes!.map((w) =>
    w.path === 'src/board.js'
      ? { path: w.path, content: BOARD_JS.replace('return board[a];', 'return null;') }
      : w
  );
  const agent = new MockAgent([scaffoldTurn, { text: 'implemented + tested', writes: brokenTest }]);
  const report = await runHarness(s1Scenario, agent);
  assert.equal(report.ok, false, 'a broken winner() must turn the run red');
  assert.equal(report.verify.checks.find((c) => c.name === 'tests')?.ok, false);
});

test('honest gate: a success reply that wrote nothing fails on authorship + presence', async () => {
  const agent = new MockAgent([scaffoldTurn, { text: 'all done! (wrote nothing)' }]);
  const report = await runHarness(s1Scenario, agent);
  assert.equal(report.ok, false, 'no files written → run must be red despite the cheerful reply');
  assert.equal(report.verify.checks.find((c) => c.name === 'authored:src/board.js')?.ok, false);
});

test('honest gate: a failed flow step stops the run and reports red', async () => {
  const agent = new MockAgent([{ fail: 'scaffold: model refused' }, executeTurn]);
  const report = await runHarness(s1Scenario, agent);
  assert.equal(report.ok, false);
  assert.equal(report.flow.steps.length, 1, 'flow must stop at the first failed step');
  assert.equal(report.flow.steps[0].ok, false);
});
