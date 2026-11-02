// @file: File exceptions require a real accepted owning-module decision with exact file and check scope.
// @spec: CLI-LINT
// @consumers: brownfield exception qualification

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFixture } from '../directive-tool-contract/fixture.ts';
import { runCli } from './run-cli.ts';

const source =
  '// @file: Registry.\n// @spec: DEMO\n// @consumers: tests\n// gennady-lint-disable: DEMO-DL-1 historical data registry only\nexport const FLAG = true;\n';
for (const [verdict, path, checks, expected] of [
  ['pending-operator', 'src/registry.ts', ['dbc', 'inventory'], false],
  ['accepted', 'src/foreign.ts', ['dbc', 'inventory'], false],
  ['rework', 'src/registry.ts', ['dbc', 'inventory'], false],
  ['accepted', 'src/registry.ts', ['dbc', 'inventory'], true],
] as const)
  test(`exception ${verdict}/${path} grants only its own accepted scope`, () => {
    const fx = buildFixture();
    try {
      const spec = join(fx.root, fx.specPath);
      const decision = `\n<!--SECTION:MODULE_DECISION_LOG-->\nDEMO-DL-1 2026-11-02 — lint-exemption: ${JSON.stringify({ file: path, checks, why: 'Historical data-only registry' })} [verdict: ${verdict}]\n<!--/SECTION:MODULE_DECISION_LOG-->\n`;
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
    const accepted = `DEMO-DL-1 2026-11-02 — lint-exemption: ${JSON.stringify({ file: 'src/registry.ts', checks: ['dbc', 'inventory'], why: 'Historical data registry' })} [verdict: accepted]`;
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
    const record = `DEMO-DL-1 2026-11-02 — lint-exemption: ${JSON.stringify({ file: 'src/registry.ts', checks: ['dbc', 'inventory'], why: 'Historical data registry' })} [verdict: accepted]`;
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
      const record = `DEMO-DL-1 2026-11-02 — lint-exemption: ${JSON.stringify({ file: 'src/registry.ts', checks, why: 'Historical data registry' })} [verdict: accepted]`;
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
