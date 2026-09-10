// @file: Both-outcomes proof of the batch's CI-suitable aggregate exit code (E-00).
// @consumers: ai/flow-eval/cli.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAggregateExitCode } from '../cli.ts';
import type { SddEvalRunArtifact } from '../sandbox-lifecycle.ts';

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

  it('exit 0 for an EMPTY batch (nothing ran, nothing failed)', () => {
    assert.strictEqual(computeAggregateExitCode([]), 0);
  });
});
