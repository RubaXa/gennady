// @file: Unit tests for the verify gate runner — classification, RUN-ALL, truncation, report.
// @consumers: CI
// @tasks: SPIKE-yaml-verify

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VerifyGate } from '../verify-config.logic.ts';

const { runGate, runVerify, truncateOutput, formatVerifyReport } =
  await import('../gate-runner.logic.ts');

/** @purpose Build a gate running node -e with the given script. */
function nodeGate(id: string, script: string, overrides: Partial<VerifyGate> = {}): VerifyGate {
  return {
    id,
    argv: [process.execPath, '-e', script],
    cwd: process.cwd(),
    timeoutMs: 30_000,
    outputMeansFailure: false,
    ...overrides,
  };
}

describe('runGate', () => {
  it('classifies exit 0 as pass and drops the output', () => {
    const result = runGate(nodeGate('ok', 'console.log("noise"); process.exit(0)'));

    assert.equal(result.status, 'pass');
    assert.equal(result.output, '');
  });

  it('classifies non-zero exit as fail and keeps the output', () => {
    const result = runGate(nodeGate('bad', 'console.error("boom"); process.exit(3)'));

    assert.equal(result.status, 'fail');
    assert.equal(result.exitCode, 3);
    assert.match(result.output, /boom/);
  });

  it('honours the gofmt -l contract: stdout on exit 0 means failure', () => {
    const result = runGate(
      nodeGate('fmt', 'console.log("offender.go")', { outputMeansFailure: true })
    );

    assert.equal(result.status, 'fail');
    assert.equal(result.exitCode, 0);
  });

  it('classifies a missing binary as env-fail, never as a code finding', () => {
    const result = runGate({
      id: 'ghost',
      argv: ['definitely-not-a-real-binary-xyz'],
      cwd: process.cwd(),
      timeoutMs: 5_000,
      outputMeansFailure: false,
    });

    assert.equal(result.status, 'env-fail');
    assert.equal(result.exitCode, null);
  });

  it('kills a gate exceeding its timeout and classifies it as timeout', () => {
    const result = runGate(nodeGate('slow', 'setTimeout(() => {}, 60000)', { timeoutMs: 300 }));

    assert.equal(result.status, 'timeout');
  });

  it('merges gate env over process.env', () => {
    const result = runGate(
      nodeGate('env', 'process.exit(process.env.VERIFY_PROBE === "42" ? 1 : 0)', {
        env: { VERIFY_PROBE: '42' },
      })
    );

    assert.equal(result.status, 'fail');
  });
});

describe('runVerify', () => {
  it('runs every gate — a failure does not short-circuit the rest (RUN-ALL)', () => {
    const report = runVerify([
      nodeGate('first', 'process.exit(1)'),
      nodeGate('second', 'process.exit(0)'),
    ]);

    assert.equal(report.results.length, 2);
    assert.equal(report.results[1]?.status, 'pass');
    assert.equal(report.ok, false);
  });

  it('never reports ok when zero gates executed', () => {
    const skipped = { ...nodeGate('off', ''), argv: [] as string[] };

    const report = runVerify([skipped]);

    assert.equal(report.total, 0);
    assert.equal(report.ok, false);
  });
});

describe('truncateOutput', () => {
  it('keeps head and tail with an elision marker — failure summaries live at the end', () => {
    const output = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

    const truncated = truncateOutput(output);

    assert.match(truncated, /^line 1\n/);
    assert.match(truncated, /line 200$/);
    assert.match(truncated, /140 lines elided/);
  });

  it('returns short output unchanged', () => {
    assert.equal(truncateOutput('a\nb'), 'a\nb');
  });
});

describe('formatVerifyReport', () => {
  it('suppresses passing gates and prints a distinct zero-gates verdict', () => {
    const pass = runVerify([nodeGate('ok', 'process.exit(0)')]);
    const zero = runVerify([]);

    assert.match(formatVerifyReport(pass), /ALL_GATES_PASS \(1\/1\)/);
    assert.doesNotMatch(formatVerifyReport(pass), /command:/);
    assert.match(formatVerifyReport(zero), /ZERO_GATES_EXECUTED/);
  });
});
