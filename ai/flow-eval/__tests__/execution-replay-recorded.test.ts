// @file: Fresh-checkout replay of all frozen execution attempts without model calls or primary-byte changes.
// @spec: AI-SKILLS
// @consumers: execution-autonomy final evidence regression

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { replayExecutionAutonomy } from '../scripts/execution-autonomy-replay.ts';

const root = resolve(import.meta.dirname, '../../..');
const prefix = 'ai/flow-eval/results/2026-10-27-execution-autonomy-final';
const recorded = JSON.parse(readFileSync(join(root, prefix, 'OFFLINE-REPLAY-4.json'), 'utf8'));

test('all sixteen primary records replay byte-exactly without any model, primary edit or retry', () => {
  const actual = replayExecutionAutonomy(root);
  assert.equal(
    JSON.stringify(actual, null, 2) + '\n',
    readFileSync(join(root, prefix, 'OFFLINE-REPLAY-4.json'), 'utf8')
  );
  assert.equal(actual.primaryAttempts, 16);
  assert.equal(actual.replacements, 0);
  assert.equal(actual.modelCalls, 0);
  assert.deepEqual(
    actual.rows.map((row) => row.originalIndex),
    Array.from({ length: 16 }, (_, i) => i)
  );
  for (const input of actual.bindings)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(root, input.path)))
        .digest('hex'),
      input.sha256,
      input.path
    );
});

test('measurement corrections never become new worker/semantic/stand PASS or fake zero billing', () => {
  const conflict = recorded.rows.find((row: any) => row.originalIndex === 10);
  assert.equal(conflict.raw.path.pass, false);
  assert.equal(conflict.derived.path.pass, true);
  assert.equal(conflict.raw.terminal.pass, false);
  assert.equal(
    conflict.derived.operatorCheckpoint.pass,
    false,
    'no missing group review is waived'
  );
  const candidate = recorded.rows.find((row: any) => row.originalIndex === 14);
  assert.equal(candidate.raw.integrity.pass, false);
  assert.equal(candidate.derived.integrity.pass, true);
  assert.equal(candidate.derived.initialTicketBound, true);
  assert.match(candidate.stand, /invalid-unowned/);
  const baseline = recorded.rows.find((row: any) => row.originalIndex === 15);
  assert.equal(baseline.workerStatus, 'completed');
  assert.equal(baseline.runOutcome, 'fail');
  assert.equal(baseline.raw.semanticVerdict, 'fail');
  assert.equal(baseline.derived.operatorCheckpoint.pass, true);
  assert.equal(baseline.derived.semanticVerdict, 'not-regraded');
  assert.match(baseline.stand, /invalid-unowned/);
  assert.match(recorded.outcome, /inconclusive/);
  assert.equal(recorded.totals.unknownPrimaryUsage, 2);
  assert.equal(recorded.totals.judgeTokens, 24907, 'judge usage is nested and must not disappear');
  assert.equal(recorded.totals.reflectionTokens, 122723);
  assert.match(recorded.monetaryCost, /unknown/);
});

test('the superseded first analysis retains its exact source snapshot rather than being repainted', () => {
  const old = JSON.parse(readFileSync(join(root, prefix, 'OFFLINE-REPLAY.json'), 'utf8'));
  const source = readFileSync(join(root, prefix, 'replay-v1-source.ts.txt'));
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    old.sourceHashes.find(
      (entry: any) => entry.path === 'ai/flow-eval/scripts/execution-autonomy-replay.ts'
    ).sha256
  );
});
