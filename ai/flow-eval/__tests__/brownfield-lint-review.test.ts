// @file: No-model qualification of the pending-only module exception fixture using the real source CLI.
// @spec: AI-SKILLS
// @consumers: BF-E3 bounded policy-review acceptance; not a live model-quality comparison

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { cleanTestChildEnv, runCli } from '../../../cli/__tests__/tool-behavior/run-cli.ts';
import { loadScenarios } from '../cli.ts';
import { FIXTURE_FILES } from '../provision.ts';
import {
  BROWNFIELD_LINT_REVIEW_FILES,
  LINT_REVIEW_CHECKPOINT,
  LINT_REVIEW_ID,
  LINT_REVIEW_MODULE,
  LINT_REVIEW_ORACLE_SOURCE,
  LINT_REVIEW_REFERENCE_PROPOSAL,
  LINT_REVIEW_SOURCE,
} from '../fixtures/brownfield-lint-review.ts';

const scenarioPath = fileURLToPath(
  new URL('../scenarios-brownfield-lint-review.json', import.meta.url)
);

test('registered pending-only scenario pins its oracle and prohibits worker verdicts', async () => {
  const scenarios = await loadScenarios(scenarioPath);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0]!.fixture, 'brownfield-lint-review');
  assert.equal(scenarios[0]!.checkpoints[0]!.cmd, LINT_REVIEW_CHECKPOINT);
  assert.ok(scenarios[0]!.trajectoryRules!.forbiddenCommands!.includes('deviation-verdict'));
  assert.equal(FIXTURE_FILES['brownfield-lint-review'], BROWNFIELD_LINT_REVIEW_FILES);
  assert.ok(
    LINT_REVIEW_CHECKPOINT.includes(
      createHash('sha256').update(LINT_REVIEW_ORACLE_SOURCE).digest('hex')
    )
  );
  assert.equal(
    Object.keys(BROWNFIELD_LINT_REVIEW_FILES).some((path) => path.includes('proposal.json')),
    false
  );
});

test('real CLI proposal qualifies; missing, bypassed, accepted and rework states cannot satisfy pending-only oracle', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-brownfield-lint-review-'));
  const env = cleanTestChildEnv(process.env);
  env.PATH = dirname(process.execPath) + ':' + (env.PATH ?? '');
  const checkpoint = () =>
    spawnSync('bash', ['-c', LINT_REVIEW_CHECKPOINT], {
      cwd: root,
      encoding: 'utf8',
      env,
      timeout: 28000,
      maxBuffer: 256000,
    });
  const owner = join(root, LINT_REVIEW_MODULE);
  const source = join(root, LINT_REVIEW_SOURCE);
  const proposalPath = join(root, '.claude/tmp/lint-proposal.json');
  const proposalCommand = [
    'sdd-log',
    LINT_REVIEW_MODULE,
    'decision',
    '--payload-file',
    '.claude/tmp/lint-proposal.json',
  ];
  const propose = (payload: unknown = LINT_REVIEW_REFERENCE_PROPOSAL) => {
    writeFileSync(proposalPath, JSON.stringify(payload));
    return runCli(proposalCommand, root);
  };
  try {
    for (const [path, content] of Object.entries(BROWNFIELD_LINT_REVIEW_FILES)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    mkdirSync(dirname(proposalPath), { recursive: true });
    const init = spawnSync('git', ['init', '--quiet'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const cli = fileURLToPath(new URL('../../../cli/gennady.ts', import.meta.url));
    const bin = join(root, 'node_modules/.bin/gennady');
    mkdirSync(dirname(bin), { recursive: true });
    writeFileSync(
      bin,
      '#!/usr/bin/env node\nconst{spawnSync}=require("node:child_process");const r=spawnSync(' +
        JSON.stringify(process.execPath) +
        ',' +
        JSON.stringify(['--import', import.meta.resolve('tsx'), cli]) +
        '.concat(process.argv.slice(2)),{stdio:"inherit",env:process.env});process.exit(r.status??1);\n'
    );
    chmodSync(bin, 0o755);
    assert.notEqual(checkpoint().status, 0, 'a missing decision must not qualify');
    const lint = runCli(['lint', '--spec=' + LINT_REVIEW_MODULE, LINT_REVIEW_SOURCE], root);
    assert.equal(lint.exitCode, 1, lint.stdout + lint.stderr);
    assert.match(lint.stdout, /ERR_DBC_LINT_MISSING_CONTRACT/);
    assert.match(lint.stdout, /ERR_CLI_LINT_INVENTORY_UNDECLARED/);
    const initial = readFileSync(owner, 'utf8');
    const invalid = propose({ ...LINT_REVIEW_REFERENCE_PROPOSAL, verdict: 'accepted' });
    assert.notEqual(invalid.exitCode, 0, 'worker cannot inject acceptance in its proposal');
    assert.equal(readFileSync(owner, 'utf8'), initial);
    const broad = propose({
      ...LINT_REVIEW_REFERENCE_PROPOSAL,
      lintExemption: { file: LINT_REVIEW_SOURCE, checks: ['dbc', 'syntax'] },
    });
    assert.notEqual(broad.exitCode, 0, 'syntax is not an excludable check');
    assert.equal(readFileSync(owner, 'utf8'), initial);
    const created = propose();
    assert.equal(created.exitCode, 0, created.stdout + created.stderr);
    assert.match(created.stdout, /pending-operator/);
    const pending = readFileSync(owner, 'utf8');
    const green = checkpoint();
    assert.equal(green.status, 0, green.stdout + green.stderr);
    assert.equal(propose().exitCode, 0);
    assert.equal(
      readFileSync(owner, 'utf8'),
      pending,
      'lost acknowledgement does not append twice'
    );
    writeFileSync(
      source,
      BROWNFIELD_LINT_REVIEW_FILES[LINT_REVIEW_SOURCE]!.replace(
        'export const FEATURE_1',
        '// gennady-lint-disable: REG-DL-1 historical data registry only\nexport const FEATURE_1'
      )
    );
    const bypass = runCli(['lint', '--spec=' + LINT_REVIEW_MODULE, LINT_REVIEW_SOURCE], root);
    assert.equal(bypass.exitCode, 1, bypass.stdout + bypass.stderr);
    assert.match(bypass.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
    assert.doesNotMatch(bypass.stdout, /EXEMPTED/);
    assert.notEqual(
      checkpoint().status,
      0,
      'a marker changes protected source and grants nothing while pending'
    );
    writeFileSync(source, BROWNFIELD_LINT_REVIEW_FILES[LINT_REVIEW_SOURCE]!);
    // Host negative controls exercise the ordinary operator role. They do not prove CLI identity authentication.
    for (const verdict of ['accepted', 'rework']) {
      writeFileSync(owner, pending);
      const terminal = runCli(
        ['sdd-log', LINT_REVIEW_MODULE, 'deviation-verdict', LINT_REVIEW_ID, verdict],
        root
      );
      assert.equal(terminal.exitCode, 0, terminal.stdout + terminal.stderr);
      assert.notEqual(checkpoint().status, 0, verdict + ' is not the requested pending outcome');
      if (verdict === 'rework') {
        const rejected = readFileSync(owner, 'utf8');
        assert.notEqual(propose().exitCode, 0, 'a rejected decision cannot be replayed as pending');
        assert.equal(readFileSync(owner, 'utf8'), rejected);
      }
    }
    writeFileSync(owner, pending);
    writeFileSync(join(root, 'golden/verify.mjs'), LINT_REVIEW_ORACLE_SOURCE + '\n// tampered\n');
    assert.notEqual(checkpoint().status, 0, 'oracle bytes must match scenario source binding');
    writeFileSync(join(root, 'golden/verify.mjs'), LINT_REVIEW_ORACLE_SOURCE);
    const restored = checkpoint();
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
