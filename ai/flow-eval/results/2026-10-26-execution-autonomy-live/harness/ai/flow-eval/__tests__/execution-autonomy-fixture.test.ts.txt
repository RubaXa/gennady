// @file: Canonical full-execute fixture viability through installed CLI, not a model or fabricated report.
// @spec: AI-SKILLS
// @consumers: pre-live execution-autonomy qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { provisionScenarioDirectories } from '../provision.ts';
import { releaseEvalDependencyLease, type EvalDependencyLeaseHandle } from '../dependency-store.ts';
import {
  executionAutonomyCase,
  executionAutonomyReference,
  executionAutonomyScenario,
  EXECUTION_AUTONOMY_CASE_IDS,
} from '../execution-autonomy-cases.ts';
import { cleanTestChildEnv } from '../../../cli/__tests__/tool-behavior/run-cli.ts';
import {
  captureExecutionAutonomy,
  checkExecutionAutonomyFunction,
} from '../execution-autonomy-evaluation.ts';

const repository = resolve(import.meta.dirname, '../../..');

test('canonical execution carrier has exactly eight source-owned cases and no worker-supplied terminal override', () => {
  assert.equal(EXECUTION_AUTONOMY_CASE_IDS.length, 8);
  for (const id of EXECUTION_AUTONOMY_CASE_IDS) {
    const a = executionAutonomyScenario(id, 'baseline');
    const b = executionAutonomyScenario(id, 'candidate');
    assert.deepEqual({ ...a, id: '' }, { ...b, id: '' });
    assert.equal(
      a.completion !== undefined,
      executionAutonomyCase(id).expectedTerminal === 'complete'
    );
  }
});

test('invalid execution carrier is rejected before dependency or sandbox allocation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-autonomy-invalid-'));
  try {
    const scenario = executionAutonomyScenario('ex1-clean', 'candidate');
    delete scenario.executionAutonomy;
    await assert.rejects(
      provisionScenarioDirectories([scenario], { rootDirectory: root, gennadyRoot: repository }),
      /canonical execute case/
    );
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normal reference closes a canonical ticket/group, broken code is red, and installed answers are absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-autonomy-canonical-'));
  const leases: EvalDependencyLeaseHandle[] = [];
  try {
    const [scenario] = await provisionScenarioDirectories(
      [executionAutonomyScenario('ex1-clean', 'candidate')],
      {
        rootDirectory: root,
        gennadyRoot: repository,
        dependencyLeaseId: randomUUID(),
        onDependencyLease: (lease) => {
          leases.push(lease);
        },
      }
    );
    assert.ok(scenario);
    const cwd = scenario.directory;
    for (const name of ['flow-eval', 'flow-sim', 'drafts', 'inspector'])
      assert.equal(existsSync(join(cwd, 'node_modules/gennady/ai', name)), false, name);
    const c = executionAutonomyCase('ex1-clean');
    const cli = (...args: string[]) =>
      spawnSync(join(cwd, 'node_modules/.bin/gennady'), args, {
        cwd,
        env: cleanTestChildEnv(process.env),
        encoding: 'utf8',
        timeout: 30_000,
      });
    const ok = (...args: string[]) => {
      const result = cli(...args);
      assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    // The initial skeleton is not a reference answer: host checks observe a genuine failure.
    assert.notEqual(cli('sdd-verify', '--task', c.ticket, '--phase', 'P2').status, 0);
    assert.equal(checkExecutionAutonomyFunction(cwd, 'ex1-clean').pass, false);
    for (const [path, body] of Object.entries(executionAutonomyReference('ex1-clean'))) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), body);
    }
    mkdirSync(join(cwd, '.claude/tmp'), { recursive: true });
    for (const phase of ['P1', 'P2']) {
      ok('sdd-task', c.ticket, '--phase', phase);
      ok('sdd-verify', '--task', c.ticket, '--phase', phase);
      writeFileSync(
        join(cwd, '.claude/tmp/handoff.txt'),
        `artifacts: [${phase === 'P1' ? c.source : 'src/delay.test.ts'}]; decisions: []; open: []; deviations: []`
      );
      ok(
        'sdd-log',
        c.ticket,
        'complete',
        '--phase',
        phase,
        '--content-file',
        '.claude/tmp/handoff.txt'
      );
    }
    ok('sdd-log', c.ticket, 'close');
    ok('sdd-sync', c.ticket);
    ok('sdd-log', c.ticket, 'audit-receipt', 'PASS');
    ok('sdd-log', c.ticket, 'review-receipt', 'PASS');
    // Tracker/group metadata changed after the first proof. Do not waive freshness: reverify it.
    for (const phase of ['P1', 'P2']) ok('sdd-verify', '--task', c.ticket, '--phase', phase);
    const result = cli('sdd-check', '--all', '.');
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(readFileSync(join(cwd, c.ticket), 'utf8'), /\[x\] DONE/);
    const good = await captureExecutionAutonomy(cwd, 'ex1-clean', {
      complete: true,
      sessions: 1,
      reasons: [],
    });
    assert.equal(good.functional.pass, true, JSON.stringify(good));
    assert.equal(good.integrity.pass, true, JSON.stringify(good));
    assert.equal(good.terminal.pass, true, JSON.stringify(good.terminal));
    writeFileSync(
      join(cwd, c.source),
      '// @spec: COR\nexport function boundedDelay(value: number, limit: number): number { return 0; }\n'
    );
    writeFileSync(
      join(cwd, 'src/delay.test.ts'),
      "// @spec: COR\nimport {test} from 'node:test'; test('[COR-REQ-1] public behavior',()=>{}); test('[COR-REQ-2] invalid input',()=>{});\n"
    );
    assert.equal(
      spawnSync('npm', ['run', 'unit'], {
        cwd,
        env: cleanTestChildEnv(process.env),
        encoding: 'utf8',
        timeout: 10_000,
      }).status,
      0
    );
    const tamper = await captureExecutionAutonomy(cwd, 'ex1-clean', {
      complete: true,
      sessions: 1,
      reasons: [],
    });
    assert.equal(
      tamper.functional.pass,
      false,
      'worker tests cannot redefine host behavior assertions'
    );
    assert.equal(tamper.terminal.pass, false);
  } finally {
    for (const lease of leases) await releaseEvalDependencyLease(lease);
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
