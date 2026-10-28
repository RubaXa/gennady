// @file: Real CLI/RuleSnapshot/Verify replan viability, with independent host behavioral assertions.
// @spec: AI-SKILLS
// @consumers: offline execution-autonomy qualification

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { cleanTestChildEnv, runCli } from '../../../cli/__tests__/tool-behavior/run-cli.ts';
import { BUILTIN_RULE_SOURCES } from '../../../shared/rules/builtin-rule-sources.ts';
import { validateCurrentSddPhaseAttempt } from '../../../shared/sdd/verify/sdd-attempt-journal.ts';
import {
  executionAutonomyFixtureFiles,
  EXECUTION_AUTONOMY_TICKET,
} from '../fixtures/execution-autonomy.ts';

const repository = resolve(import.meta.dirname, '../../..');

function provision() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-autonomy-runtime-')));
  try {
    for (const [path, bytes] of Object.entries(executionAutonomyFixtureFiles())) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), bytes);
    }
    // Qualify this host control for current ownership checks without changing frozen live inputs.
    const owner = join(root, 'specs/autonomy/autonomy.spec.md');
    writeFileSync(
      owner,
      '<!--SECTION:SPEC_ID-->\nAUT\n<!--/SECTION:SPEC_ID-->\n' + readFileSync(owner, 'utf8')
    );
    for (const path of BUILTIN_RULE_SOURCES) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), readFileSync(join(repository, path), 'utf8'));
    }
    symlinkSync(realpathSync(join(repository, 'node_modules')), join(root, 'node_modules'), 'dir');
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
      [
        '-c',
        'user.name=autonomy-test',
        '-c',
        'user.email=autonomy@test',
        'commit',
        '-qm',
        'fixture',
      ],
    ])
      execFileSync('git', args, { cwd: root, env: cleanTestChildEnv(process.env), stdio: 'pipe' });
    return root;
  } catch (cause) {
    rmSync(root, { recursive: true, force: true });
    throw cause;
  }
}

function attempts(root: string): Array<Record<string, any>> {
  return [
    ...readFileSync(join(root, EXECUTION_AUTONOMY_TICKET), 'utf8').matchAll(
      /<!--SDD_VERIFY_EVIDENCE:([A-Za-z0-9_-]+)-->/g
    ),
  ].map((match) => JSON.parse(Buffer.from(match[1] ?? '', 'base64url').toString('utf8')));
}

/** @purpose Host oracle is never installed in the worker checkout or derived from its test output. */
function hostOracle(root: string) {
  return spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      [
        'import assert from "node:assert/strict";',
        'import { boundedDelay } from "./src/delay.ts";',
        'for (const [value, limit, expected] of [[0,0,0],[0,10,0],[5,10,5],[200,50,50]]) assert.equal(boundedDelay(value,limit),expected);',
        'for (const [value, limit] of [[NaN,10],[Infinity,10],[-1,10],[10,NaN],[10,Infinity],[10,-1]]) assert.throws(() => boundedDelay(value,limit), RangeError);',
      ].join('\n'),
    ],
    { cwd: root, env: cleanTestChildEnv(process.env), encoding: 'utf8', timeout: 10_000 }
  );
}

test('real redispatch refreshes phase rules and scope, retains failed attempts, runs inserted test phase and rejects a weakened-test false green', () => {
  const root = provision();
  try {
    const cli = (...args: string[]) => runCli(args, root);
    const success = (...args: string[]) => {
      const result = cli(...args);
      assert.equal(result.exitCode, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    const base = (output: string) => {
      const value = /REPLAN_BASE: (sha256:[a-f0-9]{64})/.exec(output)?.[1];
      assert.ok(value, output);
      return value;
    };
    const digest = (output: string) => {
      const value = /rule snapshot: (sha256:[a-f0-9]{64})/.exec(output)?.[1];
      assert.ok(value, output);
      return value;
    };
    const replan = (phase: string, payload: unknown) => {
      mkdirSync(join(root, '.claude/tmp'), { recursive: true });
      writeFileSync(join(root, '.claude/tmp/replan.json'), JSON.stringify(payload));
      return success(
        'sdd-log',
        EXECUTION_AUTONOMY_TICKET,
        'replan',
        '--phase',
        phase,
        '--payload-file',
        '.claude/tmp/replan.json'
      );
    };
    const complete = (phase: string, files: string) =>
      success(
        'sdd-log',
        EXECUTION_AUTONOMY_TICKET,
        'complete',
        `artifacts: [${files}]; decisions: []; open: []; deviations: []`,
        '--phase',
        phase
      );
    assert.equal(
      hostOracle(root).status,
      0,
      'reference behavior passes the independent product contract'
    );
    const initial = success('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P1');
    assert.match(
      initial,
      /RULE_SELECTED id=delay-helper/,
      'explicit phase Rules are mandatory declarations, not registry-only candidates'
    );
    replan('P1', {
      id: 'RP-helper',
      base: base(initial),
      reason: 'Extract finite delay validation',
      evidence: 'The invalid-input scenario requires the shared finite guard',
      addTargets: ['src/delay.guard.ts'],
      dependencies: [],
    });
    const refreshed = success('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P1');
    assert.match(refreshed, /CREATE files: src\/delay.guard.ts/);
    assert.match(refreshed, /RULE_SELECTED id=delay-helper/);
    assert.notEqual(digest(refreshed), digest(initial));
    const missing = cli('sdd-verify', '--task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P1');
    assert.notEqual(missing.exitCode, 0, 'no PASS for an absent promised helper');
    assert.notEqual(attempts(root).at(-1)?.state, 'PASS');
    writeFileSync(
      join(root, 'src/delay.guard.ts'),
      '// @spec: AUT\nexport const finiteDelay = (value: number) => Number.isFinite(value) && value >= 0;\n'
    );
    success('sdd-verify', '--task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P1');
    assert.equal(attempts(root).at(-1)?.identity.rulesDigest, digest(refreshed));
    complete('P1', 'src/delay.ts, src/delay.guard.ts');
    const beforeSplit = success('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P2');
    assert.doesNotMatch(
      beforeSplit,
      /RULE_SELECTED id=typescript-rules/,
      'test facts veto strict source-only TypeScript rules'
    );
    replan('P2', {
      id: 'RP-tests',
      base: base(beforeSplit),
      reason: 'Isolate the invalid-input test implementation',
      evidence: 'Two mapped files cover independent positive and rejection paths',
      addTargets: [],
      dependencies: ['P3'],
      insertPhase: {
        id: 'P3',
        objective: 'Implement the existing rejection scenario',
        targets: ['src/delay.invalid.test.ts'],
        dependencies: ['P1'],
      },
      moveTests: ['src/delay.invalid.test.ts'],
    });
    const stale = cli('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P3');
    assert.notEqual(stale.exitCode, 0, 'do not reuse the pre-replan prerequisite PASS');
    assert.equal(
      validateCurrentSddPhaseAttempt(root, join(root, EXECUTION_AUTONOMY_TICKET), 'P1').ok,
      false
    );
    success('sdd-verify', '--task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P1');
    const split = success('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P3');
    assert.match(split, /READ files:  src\/delay.invalid.test.ts/);
    assert.match(split, /sdd-verify --task(?:=| ).* --phase(?:=| )P3/);
    assert.notEqual(digest(split), digest(beforeSplit));
    assert.doesNotMatch(split, /RULE_SELECTED id=typescript-rules/);
    success('sdd-verify', '--task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P3');
    const testAttempt = attempts(root).at(-1);
    assert.equal(testAttempt?.selector, 'autonomy-test');
    assert.equal(testAttempt?.state, 'PASS');
    assert.equal(testAttempt?.identity.rulesDigest, digest(split));
    assert.ok(testAttempt?.processes[0].identity.startsWith('local-process:'));
    assert.equal(testAttempt?.testStats[0].executed, 2);
    assert.equal(testAttempt?.testStats[0].passed, 2);
    complete('P3', 'src/delay.invalid.test.ts');
    success('sdd-task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P2');
    success('sdd-verify', '--task', EXECUTION_AUTONOMY_TICKET, '--phase', 'P2');
    complete('P2', 'src/delay.test.ts');
    success('sdd-log', EXECUTION_AUTONOMY_TICKET, 'close');
    assert.equal(
      attempts(root).length,
      5,
      'failure plus all real re-verification attempts survive'
    );
    assert.notEqual(attempts(root)[0]?.state, 'PASS');
    assert.equal(hostOracle(root).status, 0);
    // Mutate both implementation and worker-owned tests: an all-green test log must not define acceptance.
    writeFileSync(
      join(root, 'src/delay.ts'),
      'export function boundedDelay(_value: number, limit: number): number { return limit; }\n'
    );
    writeFileSync(
      join(root, 'src/delay.test.ts'),
      'import { test } from "node:test"; test("caps a finite delay", () => {});\n'
    );
    writeFileSync(
      join(root, 'src/delay.invalid.test.ts'),
      'import { test } from "node:test"; test("rejects invalid delays", () => {});\n'
    );
    const weak = spawnSync('npm', ['run', 'unit'], {
      cwd: root,
      env: cleanTestChildEnv(process.env),
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(weak.status, 0, 'mutable worker tests alone can be falsely green');
    assert.notEqual(
      hostOracle(root).status,
      0,
      'host-owned contract rejects the same weakened candidate'
    );
    assert.equal(
      validateCurrentSddPhaseAttempt(root, join(root, EXECUTION_AUTONOMY_TICKET), 'P2').ok,
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false, 'remove the owned sandbox, not shared dependencies');
});
