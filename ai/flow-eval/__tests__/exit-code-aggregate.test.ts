// @file: Both-outcomes proof of the batch's CI-suitable aggregate exit code (E-00).
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/cli.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeAggregateExitCode } from '../cli.ts';
import {
  countPendingOperatorDeviations,
  formatBudgetExhausted,
  type SddEvalRunArtifact,
} from '../sandbox-lifecycle.ts';

function artifact(over: Partial<SddEvalRunArtifact>): SddEvalRunArtifact {
  return {
    scenarioId: 'x',
    verdict: 'pass',
    status: 'completed',
    specFiles: [],
    directory: '/tmp/x',
    ...over,
  };
}

describe('E-00: the batch exit code is a mechanical fold over durable outcomes, suitable for a gate', () => {
  it('exit 0 when every scenario is a durable success', () => {
    assert.strictEqual(
      computeAggregateExitCode([
        artifact({ scenarioId: 'a', verdict: 'pass' }),
        artifact({
          scenarioId: 'b',
          verdict: 'pass',
          quality: { rule: 'R1', pass: true, detail: 'clean' },
        }),
      ]),
      0
    );
  });

  it('exit 1 when ANY scenario is a worker-error, even if the rest passed', () => {
    assert.strictEqual(
      computeAggregateExitCode([
        artifact({ scenarioId: 'a', verdict: 'pass' }),
        artifact({ scenarioId: 'b', verdict: 'worker-error', status: 'error' }),
      ]),
      1
    );
  });

  it('exit 1 when ANY scenario fails its deterministic quality gate, even if the rest passed', () => {
    assert.strictEqual(
      computeAggregateExitCode([
        artifact({ scenarioId: 'a', verdict: 'pass' }),
        artifact({
          scenarioId: 'b',
          verdict: 'pass',
          quality: { rule: 'R-COMPLETE', pass: false, detail: 'ticket not DONE' },
        }),
      ]),
      1
    );
  });

  it('E-17: budget-exhausted stays separate and does not fail CI or pass/fail statistics', () => {
    const exhausted = artifact({
      verdict: 'budget-exhausted',
      outcome: 'budget-exhausted',
      budgetExhausted: {
        kind: 'observation',
        detail: 'maximum observation count 3 reached',
        pendingOperatorCount: 1,
      },
      quality: { rule: 'R-COMPLETE', pass: false, detail: 'unfinished at budget boundary' },
    });
    assert.strictEqual(computeAggregateExitCode([exhausted]), 0);
    assert.deepEqual(exhausted.budgetExhausted, {
      kind: 'observation',
      detail: 'maximum observation count 3 reached',
      pendingOperatorCount: 1,
    });
    assert.ok(exhausted.budgetExhausted);
    assert.equal(
      formatBudgetExhausted(exhausted.budgetExhausted),
      'observation — maximum observation count 3 reached; pending-operator=1'
    );
  });

  it('E-17 counts unresolved pending records at the budget boundary without fabricating proof', async () => {
    const root = mkdtempSync(join(tmpdir(), 'e17-pending-'));
    try {
      const specs = join(root, 'specs', 'demo');
      mkdirSync(specs, { recursive: true });
      writeFileSync(
        join(specs, 'demo.task.DEM-one.md'),
        '<!--SECTION:DECISION_LOG-->\n' +
          'DEM-DL-1 2026-09-22 — retry cap 3 (почему: silent) [verdict: pending-operator]\n' +
          '<!--/SECTION:DECISION_LOG-->'
      );
      writeFileSync(
        join(specs, 'demo.task.DEM-two.md'),
        '<!--SECTION:DECISION_LOG-->\n' +
          'DEM-DL-2 2026-09-22 — accepted (почему: reviewed) [verdict: accepted]\n' +
          '<!--/SECTION:DECISION_LOG-->'
      );
      assert.equal(await countPendingOperatorDeviations(root), 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exit 0 for an EMPTY batch (nothing ran, nothing failed)', () => {
    assert.strictEqual(computeAggregateExitCode([]), 0);
  });
});
