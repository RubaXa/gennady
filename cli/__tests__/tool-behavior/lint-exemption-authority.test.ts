// @file: File exceptions require a real accepted owning-module decision with exact file and check scope.
// @spec: CLI-LINT
// @consumers: brownfield exception qualification

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  appendModuleLintExemptionDecision,
  setDeviationVerdict,
} from '../../../shared/sdd/deviation.ts';
import { buildFixture } from '../directive-tool-contract/fixture.ts';
import { runCli } from './run-cli.ts';

/** @purpose Host-supplied operator states for permission-scope negatives, not model-authored approvals. */
function fixtureRecord(file: string, checks: readonly string[], verdict: string): string {
  const content = '<!--SECTION:MODULE_DECISION_LOG-->\n<!--/SECTION:MODULE_DECISION_LOG-->\n';
  const raw = {
    id: 'DEMO-DL-1',
    what: 'Keep historical registry',
    why: 'Historical data-only registry',
    where: file,
    evidence: 'Closed constants registry',
    alternative: 'Unrelated rewrite',
    verify: 'Syntax and project tests still required',
    lintExemption: { file, checks },
  };
  const proposed = appendModuleLintExemptionDecision(content, raw, '2026-11-02');
  assert.equal(proposed.ok, true);
  if (!proposed.ok) throw new Error(proposed.detail);
  const terminal =
    verdict === 'pending-operator'
      ? proposed
      : setDeviationVerdict(
          proposed.content,
          raw.id,
          verdict as 'accepted' | 'rework' | 'rolled-back',
          'module'
        );
  assert.equal(terminal.ok, true);
  if (!terminal.ok) throw new Error(terminal.detail);
  return terminal.content.split('\n').find((line) => line.startsWith('DEMO-DL-1 '))!;
}

const source =
  '// @file: Registry.\n// @spec: DEMO\n// @consumers: tests\n// gennady-lint-disable: DEMO-DL-1 historical data registry only\nexport const FLAG = true;\n';
for (const [verdict, path, checks, expected] of [
  ['pending-operator', 'src/registry.ts', ['dbc', 'inventory'], false],
  ['accepted', 'src/foreign.ts', ['dbc', 'inventory'], false],
  ['rework', 'src/registry.ts', ['dbc', 'inventory'], false],
  ['rolled-back', 'src/registry.ts', ['dbc', 'inventory'], false],
  ['accepted', 'src/registry.ts', ['dbc', 'inventory'], true],
] as const)
  test(`exception ${verdict}/${path} grants only its own accepted scope`, () => {
    const fx = buildFixture();
    try {
      const spec = join(fx.root, fx.specPath);
      const decision = `\n<!--SECTION:MODULE_DECISION_LOG-->\n${fixtureRecord(path, checks, verdict)}\n<!--/SECTION:MODULE_DECISION_LOG-->\n`;
      writeFileSync(
        spec,
        readFileSync(spec, 'utf8') +
          '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n' +
          decision
      );
      writeFileSync(join(fx.root, 'src/registry.ts'), source);
      const result = runCli(['lint', '--spec', fx.specPath, 'src/registry.ts'], fx.root);
      assert.equal(result.exitCode, expected ? 0 : 1, result.stdout + result.stderr);
      if (expected) assert.match(result.stdout, /EXEMPTED.*checks=dbc,inventory.*DEMO-DL-1/);
      else assert.match(result.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

test('a nonexistent decision token cannot switch off contract lint', () => {
  const fx = buildFixture();
  try {
    writeFileSync(join(fx.root, 'src/registry.ts'), source);
    const result = runCli(['lint', 'src/registry.ts'], fx.root);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
    assert.match(result.stdout, /MISSING_CONTRACT/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ordinary duplicate ID and conflicting declaration owner cannot grant an exception', () => {
  const fx = buildFixture();
  try {
    const path = join(fx.root, fx.specPath);
    const original = readFileSync(path, 'utf8');
    const accepted = fixtureRecord('src/registry.ts', ['dbc', 'inventory'], 'accepted');
    const mapping =
      '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n';
    writeFileSync(join(fx.root, 'src/registry.ts'), source);
    writeFileSync(
      path,
      original +
        mapping +
        '\n<!--SECTION:MODULE_DECISION_LOG-->\n' +
        accepted +
        '\nDEMO-DL-1 ordinary duplicate\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
    );
    const duplicate = runCli(['lint', 'src/registry.ts'], fx.root);
    assert.equal(duplicate.exitCode, 1);
    assert.match(duplicate.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
    writeFileSync(
      path,
      original +
        '\n<!--SECTION:MODULE_DECISION_LOG-->\n' +
        accepted +
        '\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
    );
    const undeclared = runCli(['lint', 'src/registry.ts'], fx.root);
    assert.equal(undeclared.exitCode, 1);
    assert.match(undeclared.stdout, /declaration owner/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('accepted exception never disables syntax validation', () => {
  const fx = buildFixture();
  try {
    const path = join(fx.root, fx.specPath);
    const record = fixtureRecord('src/registry.ts', ['dbc', 'inventory'], 'accepted');
    writeFileSync(
      path,
      readFileSync(path, 'utf8') +
        '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n<!--SECTION:MODULE_DECISION_LOG-->\n' +
        record +
        '\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
    );
    writeFileSync(join(fx.root, 'src/registry.ts'), source.replace('true;', ';'));
    const result = runCli(['lint', 'src/registry.ts'], fx.root);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /ERR_DBC_LINT_PARSE_FAILED/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

for (const [checks, retainedError] of [
  [['dbc'], 'ERR_CLI_LINT_INVENTORY_UNDECLARED'],
  [['inventory'], 'ERR_DBC_LINT_MISSING_CONTRACT'],
] as const)
  test(`accepted ${checks.join(',')} exception preserves the other check`, () => {
    const fx = buildFixture();
    try {
      const path = join(fx.root, fx.specPath);
      const record = fixtureRecord('src/registry.ts', checks, 'accepted');
      writeFileSync(
        path,
        readFileSync(path, 'utf8') +
          '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n<!--SECTION:MODULE_DECISION_LOG-->\n' +
          record +
          '\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
      );
      writeFileSync(join(fx.root, 'src/registry.ts'), source);
      const result = runCli(['lint', '--spec', fx.specPath, 'src/registry.ts'], fx.root);
      assert.equal(result.exitCode, 1, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(retainedError));
      assert.match(result.stdout, new RegExp(`EXEMPTED.*checks=${checks.join(',')}`));
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

test('module decision proposal stays pending until the existing operator verdict transition', () => {
  const fx = buildFixture();
  try {
    const path = join(fx.root, fx.specPath);
    writeFileSync(
      path,
      readFileSync(path, 'utf8') +
        '\n<!--SECTION:MODULE_VISION-->\nRegistry module.\n<!--/SECTION:MODULE_VISION-->\n' +
        '<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n' +
        '<!--SECTION:MODULE_DECISION_LOG-->\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
    );
    writeFileSync(join(fx.root, 'src/registry.ts'), source);
    mkdirSync(join(fx.root, '.claude/tmp'), { recursive: true });
    const payload = {
      id: 'DEMO-DL-1',
      what: 'Keep the closed historical registry',
      why: 'Historical data-only registry; no new entries permitted',
      where: 'src/registry.ts',
      evidence: 'Registry contains constants only',
      alternative: 'Rewriting all contracts is unrelated to this task',
      verify: 'Syntax, ownership and project tests remain mandatory',
      lintExemption: { file: 'src/registry.ts', checks: ['dbc', 'inventory'] },
    };
    const proposal = [
      'sdd-log',
      fx.specPath,
      'decision',
      '--payload-file',
      '.claude/tmp/exemption.json',
    ];
    const propose = () => {
      writeFileSync(join(fx.root, '.claude/tmp/exemption.json'), JSON.stringify(payload));
      return runCli(proposal, fx.root);
    };
    const before = readFileSync(path, 'utf8');
    const missingPayload = runCli(['sdd-log', fx.specPath, 'decision'], fx.root);
    assert.notEqual(missingPayload.exitCode, 0);
    assert.match(missingPayload.stdout, /no --phase/);
    assert.equal(readFileSync(path, 'utf8'), before);
    const forged = { ...payload, verdict: 'accepted' };
    writeFileSync(join(fx.root, '.claude/tmp/exemption.json'), JSON.stringify(forged));
    assert.notEqual(runCli(proposal, fx.root).exitCode, 0);
    assert.equal(readFileSync(path, 'utf8'), before);
    const created = propose();
    assert.equal(created.exitCode, 0, created.stdout + created.stderr);
    const pending = readFileSync(path, 'utf8');
    assert.match(pending, /\[verdict: pending-operator\]/);
    assert.match(created.stdout, /operator|Operator/);
    assert.equal(propose().exitCode, 0);
    assert.equal(
      readFileSync(path, 'utf8'),
      pending,
      'lost acknowledgement retry is byte-idempotent'
    );
    const denied = runCli(['lint', '--spec', fx.specPath, 'src/registry.ts'], fx.root);
    assert.equal(denied.exitCode, 1, denied.stdout + denied.stderr);
    assert.match(denied.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
    assert.ok(denied.stdout.includes(`sdd-log ${fx.specPath} decision --payload-file`));
    assert.match(denied.stdout, /only an explicit operator decision/);
    const approved = runCli(
      ['sdd-log', fx.specPath, 'deviation-verdict', payload.id, 'accepted'],
      fx.root
    );
    assert.equal(approved.exitCode, 0, approved.stdout + approved.stderr);
    assert.equal(
      readFileSync(path, 'utf8'),
      pending.replace('[verdict: pending-operator]', '[verdict: accepted]')
    );
    const granted = runCli(['lint', '--spec', fx.specPath, 'src/registry.ts'], fx.root);
    assert.equal(granted.exitCode, 0, granted.stdout + granted.stderr);
    assert.match(granted.stdout, /EXEMPTED.*checks=dbc,inventory/);
    assert.equal(propose().exitCode, 0);
    const changed = { ...payload, lintExemption: { file: 'src/registry.ts', checks: ['dbc'] } };
    writeFileSync(join(fx.root, '.claude/tmp/exemption.json'), JSON.stringify(changed));
    assert.notEqual(runCli(proposal, fx.root).exitCode, 0, 'same ID cannot gain a different scope');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('old bare accepted exemption text is not a canonical decision proposal', () => {
  const fx = buildFixture();
  try {
    const path = join(fx.root, fx.specPath);
    const old =
      'DEMO-DL-1 2026-11-02 — lint-exemption: ' +
      JSON.stringify({
        file: 'src/registry.ts',
        checks: ['dbc', 'inventory'],
        why: 'Historical registry only',
      }) +
      ' [verdict: accepted]';
    writeFileSync(
      path,
      readFileSync(path, 'utf8') +
        '\n<!--SECTION:FILE_STRUCTURE-->\n**File Mapping:**\n- `src/registry.ts`: registry\n<!--/SECTION:FILE_STRUCTURE-->\n<!--SECTION:MODULE_DECISION_LOG-->\n' +
        old +
        '\n<!--/SECTION:MODULE_DECISION_LOG-->\n'
    );
    writeFileSync(join(fx.root, 'src/registry.ts'), source);
    const result = runCli(['lint', '--spec', fx.specPath, 'src/registry.ts'], fx.root);
    assert.equal(result.exitCode, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /ERR_CLI_LINT_UNAUTHORIZED_DISABLE/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
