// @file: Real-process regressions for large runner-owned Vitest statistics without relaxing output bounds.
// @spec: CLI-VERIFY
// @consumers: Verify local executor qualification

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { executeLocalStep } from '../local.executor.ts';
import { acquireWorkspaceGuard } from '../workspace-guard.ts';
import type { PlannedVerifyStep } from '../../model/verify-step.type.ts';

async function runReport(
  large: boolean,
  broken = false,
  options: { script?: string; timeoutMs?: number } = {}
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-vitest-output-')));
  try {
    writeFileSync(join(root, 'input.txt'), 'unchanged\n');
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
      ['commit', '-qm', 'input'],
    ])
      execFileSync('git', [
        '-C',
        root,
        '-c',
        'user.name=stats',
        '-c',
        'user.email=stats@test',
        ...args,
      ]);
    const acquired = acquireWorkspaceGuard(root, { signalHandlers: false });
    assert.equal(acquired.kind, 'guard');
    if (acquired.kind !== 'guard') throw new Error('fixture guard unavailable');
    try {
      const script =
        options.script ??
        `const r={numTotalTests:4,numPassedTests:4,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{detail:'x'.repeat(${large ? 1_539_029 : 8})}]};process.stdout.write(JSON.stringify(r)${broken ? '.slice(0,-1)' : ''});`;
      const step: PlannedVerifyStep = {
        id: 'node:unit',
        plugin: 'node',
        tags: ['unit'],
        needs: [],
        executor: 'local',
        effect: 'observe',
        command: {
          argv: [process.execPath, '-e', script],
          cwd: root,
          timeoutMs: options.timeoutMs ?? 10_000,
        },
        requires: [],
        timeoutMs: options.timeoutMs ?? 10_000,
        onFailure: 'stop-phase',
        testStats: {
          policy: 'required',
          protocol: 'vitest-json-v1',
          runner: 'vitest',
          source: 'fixture:runner',
        },
      };
      return await executeLocalStep(step, acquired.guard);
    } finally {
      assert.deepEqual(acquired.guard.release(), { kind: 'released' });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('complete large runner JSON proves the same counters as a small report', async () => {
  const small = await runReport(false);
  assert.equal(small.verdict, 'pass');
  const large = await runReport(true);
  assert.equal(large.verdict, 'pass', JSON.stringify(large.problem));
  assert.deepEqual(large.result?.testStats, small.result?.testStats);
});

test('truncated large runner JSON cannot manufacture valid statistics', async () => {
  const result = await runReport(true, true);
  assert.equal(result.verdict, 'violation');
  assert.equal(result.problem?.code, 'VERIFY_LOCAL_TEST_STATS_INVALID');
});

const stats = JSON.stringify({
  numTotalTests: 4,
  numPassedTests: 4,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
});

test('valid stdout statistics cannot override a failed process or timeout', async () => {
  const nonzero = await runReport(false, false, {
    script: `process.stdout.write(${JSON.stringify(stats)});process.exitCode=2;`,
  });
  assert.equal(nonzero.verdict, 'fail');
  const timed = await runReport(false, false, {
    script: `process.stdout.write(${JSON.stringify(stats)});setTimeout(()=>{},10000);`,
    timeoutMs: 250,
  });
  assert.equal(timed.verdict, 'timeout');
});

test('Vitest statistics are stdout-only; stderr cannot manufacture or replace them', async () => {
  const stderrOnly = await runReport(false, false, {
    script: `process.stderr.write(${JSON.stringify(stats)});`,
  });
  assert.equal(stderrOnly.verdict, 'violation');
  const wrong = JSON.stringify({
    numTotalTests: 99,
    numPassedTests: 99,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
  });
  const both = await runReport(false, false, {
    script: `process.stderr.write(${JSON.stringify(wrong)});process.stdout.write(${JSON.stringify(stats)});`,
  });
  assert.equal(both.verdict, 'pass');
  assert.equal(both.result?.testStats?.executed, 4);
});

test('a zero exit cannot erase failed tests in valid statistics', async () => {
  const failed = JSON.stringify({
    numTotalTests: 4,
    numPassedTests: 3,
    numFailedTests: 1,
    numPendingTests: 0,
    numTodoTests: 0,
  });
  const result = await runReport(false, false, {
    script: `process.stdout.write(${JSON.stringify(failed)});`,
  });
  assert.equal(result.verdict, 'fail');
  assert.equal(result.result?.testStats?.failed, 1);
});
