// @file: Proof that the judge's verdict is diagnostic only and never participates in the batch's
//   exit code (E-21, D-28/L-14).
// @consumers: ai/flow-eval/cli.ts, ai/flow-eval/judge.ts
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

describe('E-21: the judge verdict is diagnostic only and never participates in the exit code', () => {
  it('a judge `fail` verdict alone does NOT fail the batch when the deterministic gate passed', () => {
    assert.strictEqual(
      computeAggregateExitCode([
        artifact({
          verdict: 'fail', // judge said fail
          quality: { rule: 'R1', pass: true, detail: 'clean' }, // mechanics said pass
        }),
      ]),
      0
    );
  });

  it('a judge `inconclusive` verdict alone does NOT fail the batch either', () => {
    assert.strictEqual(computeAggregateExitCode([artifact({ verdict: 'inconclusive' })]), 0);
  });

  it('conversely, a judge `pass` verdict does NOT rescue a failed deterministic gate', () => {
    assert.strictEqual(
      computeAggregateExitCode([
        artifact({
          verdict: 'pass', // judge said pass
          quality: { rule: 'R1', pass: false, detail: '3 sdd-check error(s)' }, // mechanics said fail
        }),
      ]),
      1
    );
  });
});
