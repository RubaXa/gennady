// @file: Unit tests for the gate runner — RUN-ALL, stdout contract, env-fail predicates, report format.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Gate, StackDiagnostic, StackRun } from '../stack.types.ts';

const { runVerify, formatVerifyReport, exitAbove, outputMatches } =
  await import('../gate-runner.ts');

/** @purpose Build a gate that runs a shell snippet through `sh -c`. */
function shellGate(id: string, script: string, extra: Partial<Gate> = {}): Gate {
  return {
    id,
    stack: 'golang',
    label: id,
    argv: ['/bin/sh', '-c', script],
    cwd: process.cwd(),
    timeoutMs: 30_000,
    outputMeansFailure: false,
    skipped: null,
    ...extra,
  };
}

/** @purpose Wrap gates into a single-stack run fixture. */
function runOf(gates: Gate[]): StackRun {
  return {
    detection: {
      stack: 'golang',
      root: process.cwd(),
      summary: ['module: example.com/x'],
      diagnostics: [],
      details: null,
    },
    scope: { mode: 'changed', note: 'test fixture', details: null },
    gates,
  };
}

describe('runVerify', () => {
  it('runs every gate even after one fails (RUN-ALL)', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('build', 'exit 1'),
          shellGate('vet', 'exit 0'),
          shellGate('test', 'exit 0'),
        ]),
      ],
      []
    );

    assert.equal(report.total, 3);
    assert.equal(report.passed, 2);
    assert.equal(report.ok, false);
  });

  it('treats stdout as failure when outputMeansFailure is set, despite exit 0', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'echo bad.go; exit 0', { outputMeansFailure: true })])],
      []
    );

    assert.equal(report.results[0]?.status, 'fail');
    assert.match(report.results[0]?.output ?? '', /bad\.go/);
  });

  it('passes an outputMeansFailure gate that prints nothing', () => {
    const report = runVerify(
      [runOf([shellGate('fmt', 'exit 0', { outputMeansFailure: true })])],
      []
    );

    assert.equal(report.results[0]?.status, 'pass');
    assert.equal(report.ok, true);
  });

  it('classifies a failure as env-fail when an outputMatches predicate fires', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('lint', 'echo "panic: package requires newer Go version"; exit 2', {
            envFail: [outputMatches(/^panic: /m)],
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('classifies exit codes above the exitAbove threshold as env-fail', () => {
    const report = runVerify(
      [runOf([shellGate('lint', 'exit 3', { envFail: [exitAbove(1)] })])],
      []
    );

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('keeps exit codes at or below the exitAbove threshold as genuine findings', () => {
    const report = runVerify(
      [runOf([shellGate('lint', 'echo "a.go:1: issue"; exit 1', { envFail: [exitAbove(1)] })])],
      []
    );

    assert.equal(report.results[0]?.status, 'fail');
  });

  it('treats a failure without predicates as a code finding', () => {
    const report = runVerify([runOf([shellGate('test', 'exit 1')])], []);

    assert.equal(report.results[0]?.status, 'fail');
  });

  it('classifies an unspawnable binary as env-fail', () => {
    const broken: Gate = { ...shellGate('build', ''), argv: ['/definitely/not/a/binary'] };
    const report = runVerify([runOf([broken])], []);

    assert.equal(report.results[0]?.status, 'env-fail');
  });

  it('kills a gate exceeding its own timeoutMs and reports TIMEOUT', () => {
    const report = runVerify([runOf([shellGate('test', 'sleep 5', { timeoutMs: 300 })])], []);

    assert.equal(report.results[0]?.status, 'timeout');
  });

  it('merges gate.env over the process environment', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('build', '[ "$STACK_TEST_VAR" = "42" ] || { echo "missing env"; exit 1; }', {
            env: { STACK_TEST_VAR: '42' },
          }),
        ]),
      ],
      []
    );

    assert.equal(report.results[0]?.status, 'pass');
  });

  it('reports skipped gates without executing them and excludes them from totals', () => {
    const skipped: Gate = { ...shellGate('lint', 'exit 1'), argv: [], skipped: 'tool not found' };
    const report = runVerify([runOf([skipped])], []);

    assert.equal(report.results[0]?.status, 'skipped');
    assert.equal(report.total, 0);
    assert.equal(report.ok, true);
  });
});

describe('formatVerifyReport', () => {
  it('reports ZERO_GATES, not ALL_GATES_PASS, when nothing was executed (review B2)', () => {
    const skipped: Gate = { ...shellGate('lint', 'exit 1'), argv: [], skipped: 'tool not found' };
    const report = runVerify([runOf([skipped])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /ZERO_GATES/);
    assert.ok(!text.includes('ALL_GATES_PASS'), 'verified-nothing must not read as success');
  });

  it('keeps the tail of long failure output, where test runners put the summary (review N1)', () => {
    const report = runVerify([runOf([shellGate('vet', 'seq 1 500; exit 1')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /lines truncated/);
    assert.ok(
      text.includes('\n499\n'),
      'the tail (failure summary territory) must survive truncation'
    );
  });

  it('prints a single summary line and nothing else when all gates pass', () => {
    const report = runVerify([runOf([shellGate('vet', 'echo noise; exit 0')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /ALL_GATES_PASS \(1\/1\)/);
    assert.ok(!text.includes('noise'), 'passing gates must contribute no output');
  });

  it('includes stack-qualified name, command, cwd and output for a failing gate', () => {
    const report = runVerify([runOf([shellGate('vet', 'echo boom >&2; exit 3')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /FAIL gate: golang:vet/);
    assert.match(text, /command:/);
    assert.match(text, /cwd:/);
    assert.match(text, /boom/);
  });

  it('warns an agent not to edit sources on env-fail', () => {
    const report = runVerify(
      [
        runOf([
          shellGate('lint', 'echo "panic: boom"; exit 2', {
            envFail: [outputMatches(/^panic: /m)],
          }),
        ]),
      ],
      []
    );
    const text = formatVerifyReport(report);

    assert.match(text, /ENV_FAIL/);
    assert.match(text, /NOT a finding about the code/);
  });

  it('renders diagnostics with their fixes', () => {
    const diagnostic: StackDiagnostic = { code: 'X_CODE', message: 'broken', fix: 'do this' };
    const report = runVerify([runOf([shellGate('vet', 'exit 0')])], [diagnostic]);
    const text = formatVerifyReport(report);

    assert.match(text, /X_CODE: broken/);
    assert.match(text, /fix: do this/);
  });

  it('truncates very long failure output with an explicit marker', () => {
    const report = runVerify([runOf([shellGate('vet', 'seq 1 500; exit 1')])], []);
    const text = formatVerifyReport(report);

    assert.match(text, /lines truncated/);
  });
});
