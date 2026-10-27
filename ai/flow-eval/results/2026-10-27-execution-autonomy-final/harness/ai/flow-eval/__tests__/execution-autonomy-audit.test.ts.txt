// @file: Real project-full audit qualification; no receipts substitute for an executed gate.
// @spec: AI-SKILLS
// @consumers: execution-autonomy fixture correction controls

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { provisionScenarioDirectories } from '../provision.ts';
import {
  buildExecutionAutonomyFixture,
  executionAutonomyCase,
  executionAutonomyReference,
  executionAutonomyScenario,
} from '../execution-autonomy-cases.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhaseDetail } from '../../../shared/sdd/ticket.ts';
import {
  checkExecutionAutonomyInitialRouting,
  qualifyExecutionAutonomyCase,
} from '../execution-autonomy-controls.ts';

const repository = resolve(import.meta.dirname, '../../..');

test('initial routing guard refuses blocked mentions before any reference or Verify operation', () => {
  const c = executionAutonomyCase('ex3-helper');
  const calls: string[][] = [];
  assert.throws(
    () =>
      checkExecutionAutonomyInitialRouting(c.id, (...args) => {
        calls.push(args);
        return {
          status: 0,
          stdout:
            args.length === 1
              ? `pickable (ready now): — none\nblocked: COR-work ← EXECUTION_READY=no → ${c.ticket}\nEXECUTION_READY=no\nGATE_QUEUE=none\n`
              : 'initial P1: src/delay.ts; helper still absent',
          stderr: '',
        };
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^readiness-map-conflict:/);
      assert.match(error.message, /routing confound, not proof of impossible phase execution/);
      assert.match(error.message, /initial-pre-reference/);
      assert.match(error.message, /blocked: COR-work/);
      assert.match(error.message, /helper still absent/);
      return true;
    }
  );
  assert.deepEqual(calls, [['sdd-task'], ['sdd-task', c.ticket, '--phase', 'P1']]);
});

test('initial routing guard accepts exact pickable rows without claiming builtin readiness or gate PASS', () => {
  const c = executionAutonomyCase('ex1-clean');
  const result = checkExecutionAutonomyInitialRouting(c.id, (...args) => ({
    status: 0,
    stdout:
      args.length === 1
        ? `pickable (ready now):\n  COR-work → ${c.ticket}\nEXECUTION_READY=no\nGATE_QUEUE=none\n`
        : 'exact initial P1 dispatch permitted',
    stderr: '',
  }));
  assert.equal(result.taskPickable, true);
  assert.match(result.map.stdout, /EXECUTION_READY=no/);
  assert.equal(result.stage, 'initial-pre-reference');
  assert.equal('fullVerificationPass' in result, false);
});

test('initial routing diagnostics are bounded and failed probes never qualify a prepared fixture', () => {
  for (const status of [1, null]) {
    assert.throws(
      () =>
        checkExecutionAutonomyInitialRouting('ex1-clean', () => ({
          status,
          stdout: 'x'.repeat(50_000),
          stderr: 'y'.repeat(50_000),
        })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^initial-routing-probe-failed:/);
        assert.ok(error.message.length < 21_000);
        return true;
      }
    );
  }
});

test('current built runtime qualifies initial global routing before reference full/audit controls', async () => {
  const result = await qualifyExecutionAutonomyCase(repository, 'ex3-helper');
  assert.equal(result.initialRouting.taskPickable, true);
  assert.equal(result.initialRouting.map.exitCode, 0);
  assert.equal(result.initialRouting.phase.exitCode, 0);
  assert.match(result.initialRouting.map.stdout, /EXECUTION_READY=no/);
  assert.match(result.initialRouting.phase.stdout, /READ files:  src\/delay\.ts\n/);
  assert.equal(result.fullVerificationPass, true);
  assert.equal(result.cleanup, true);
  assert.equal(result.modelCalls, 0);
});

test('initial helper contract is approved but file and phase claim remain absent; P1 dispatch is valid', async () => {
  const id = 'ex3-helper';
  const c = executionAutonomyCase(id);
  const files = buildExecutionAutonomyFixture(id);
  assert.equal(files['src/number.ts'], undefined);
  assert.match(files[c.module]!, /\| finiteNonnegative \| Function \|/);
  assert.match(
    files[c.module]!,
    /Return true exactly for finite numeric values greater than or equal to zero/
  );
  const p1 = extractSection(files[c.ticket]!, 'PHASE_P1');
  assert.equal(p1.status, 'ok');
  if (p1.status !== 'ok') return;
  assert.deepEqual(parsePhaseDetail(p1.content).targetFiles, [c.source]);
  const root = mkdtempSync(join(tmpdir(), 'gennady-helper-dispatch-'));
  try {
    const [scenario] = await provisionScenarioDirectories(
      [executionAutonomyScenario(id, 'candidate')],
      { rootDirectory: root, gennadyRoot: repository }
    );
    assert.ok(scenario);
    const dispatch = spawnSync(
      join(scenario.directory, 'node_modules/.bin/gennady'),
      ['sdd-task', c.ticket, '--phase', 'P1'],
      {
        cwd: scenario.directory,
        env: { PATH: process.env.PATH ?? '', NO_COLOR: '1', GIT_CONFIG_NOSYSTEM: '1' },
        encoding: 'utf8',
        timeout: 30_000,
        killSignal: 'SIGKILL',
        maxBuffer: 256_000,
      }
    );
    assert.equal(dispatch.status, 0, dispatch.stdout + '\n' + dispatch.stderr);
    assert.equal(existsSync(join(scenario.directory, 'src/number.ts')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('correct reference passes the real full project gate; broken public behavior fails it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-full-audit-'));
  try {
    const [scenario] = await provisionScenarioDirectories(
      [executionAutonomyScenario('ex1-clean', 'candidate')],
      { rootDirectory: root, gennadyRoot: repository }
    );
    assert.ok(scenario);
    for (const [path, content] of Object.entries(executionAutonomyReference('ex1-clean')))
      writeFileSync(join(scenario.directory, path), content);
    const full = () =>
      spawnSync(
        join(scenario.directory, 'node_modules/.bin/gennady'),
        ['verify', '--phase', 'full'],
        {
          cwd: scenario.directory,
          env: { PATH: process.env.PATH ?? '', NO_COLOR: '1', GIT_CONFIG_NOSYSTEM: '1' },
          encoding: 'utf8',
          timeout: 30_000,
          killSignal: 'SIGKILL',
          maxBuffer: 256_000,
        }
      );
    const normal = full();
    assert.equal(normal.status, 0, normal.stdout + '\n' + normal.stderr);
    assert.match(normal.stdout, /VERDICT PASS/);
    assert.match(normal.stdout, /node:syntax/);
    assert.match(normal.stdout, /node:scenarios/);
    writeFileSync(
      join(scenario.directory, 'src/delay.ts'),
      'export function boundedDelay() { return 999; }\n'
    );
    const broken = full();
    assert.notEqual(
      broken.status,
      0,
      'the selected full gate must execute the real unit scenarios'
    );
    assert.doesNotMatch(broken.stdout, /VERDICT PASS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
