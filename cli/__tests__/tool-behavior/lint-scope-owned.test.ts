// @file: Real-CLI proof that lint.scope=owned skips legacy files no SDD spec or ticket owns.
// @spec: CLI-LINT
// @consumers: CI

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { TEST_PROCESS_TIMEOUT_MS } from '../../../utils/test/process-budget.ts';
import { buildFixture } from '../directive-tool-contract/fixture.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function lint(cwd: string, args: readonly string[] = ['src']) {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, GENNADY_ENTRY, 'lint', ...args],
    {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, HOME: cwd, GENNADY_NO_UPDATE_CHECK: '1' },
      timeout: TEST_PROCESS_TIMEOUT_MS,
    }
  );
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('lint.scope', () => {
  it('--scope all strengthens owned policy for positional, spec and staged targets without rewriting config', () => {
    const fx = buildFixture();
    try {
      writeFileSync(join(fx.root, 'src/legacy.ts'), 'export const legacy = 1;\n');
      const config = 'lint:\n  scope: owned\n';
      writeFileSync(join(fx.root, 'gennady.yaml'), config);
      execFileSync('git', ['add', 'src/legacy.ts'], { cwd: fx.root });
      const selections = [
        ['src/legacy.ts'],
        ['src/legacy.ts', `--spec=${fx.specPath}`],
        ['--staged'],
      ];
      for (const args of selections) {
        const owned = lint(fx.root, args);
        assert.equal(owned.exitCode, 0, owned.output);
        const strict = lint(fx.root, [...args, '--scope', 'all']);
        assert.equal(strict.exitCode, 1, strict.output);
        assert.match(strict.output, /src\/legacy\.ts:\d+:\d+: error: ERR_CLI_LINT_MISSING_FILE/);
        assert.match(strict.output, /Effective lint\.scope=all \(source=CLI --scope all\)/);
        assert.match(strict.output, /Project lint\.scope=owned \(source=gennady\.yaml\)/);
        assert.doesNotMatch(strict.output, /scope: owned|lint\.scope=owned: skipped/);
        assert.equal(readFileSync(join(fx.root, 'gennady.yaml'), 'utf8'), config);
      }
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('rejects weakening, malformed and repeated --scope before config/spec/target reads or autofix', () => {
    const fx = buildFixture();
    try {
      const config = 'lint: [malformed project policy\n';
      writeFileSync(join(fx.root, 'gennady.yaml'), config);
      const target = join(fx.root, 'src/legacy.ts');
      const before = 'export const legacy = 1;\n';
      writeFileSync(target, before);
      for (const flags of [
        ['--scope', 'owned'],
        ['--scope=changed'],
        ['--scope'],
        ['--scope='],
        ['--scope=all', '--scope=all'],
        ['--scope', 'all', '--scope', 'owned'],
      ]) {
        const result = lint(fx.root, [
          'src/legacy.ts',
          '--autofix',
          '--spec=missing.spec.md',
          ...flags,
        ]);
        assert.equal(result.exitCode, 4, result.output);
        assert.match(result.output, /--scope|Unknown flag/);
        assert.doesNotMatch(
          result.output,
          /ERR_CLI_LINT_BAD_CONFIG|ERR_CLI_LINT_SPEC_NOT_FOUND|ERR_CLI_LINT_MISSING_FILE/
        );
        assert.equal(readFileSync(target, 'utf8'), before);
        assert.equal(readFileSync(join(fx.root, 'gennady.yaml'), 'utf8'), config);
      }
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('reports the effective CLI override above repo rc while preserving project settings and help semantics', () => {
    const fx = buildFixture();
    try {
      writeFileSync(join(fx.root, 'src/legacy.ts'), 'export const legacy = 1;\n');
      const yaml = 'lint:\n  scope: all\n';
      const rc = '{"lint":{"scope":"owned"}}';
      writeFileSync(join(fx.root, 'gennady.yaml'), yaml);
      writeFileSync(join(fx.root, '.gennadyrc'), rc);
      const configured = lint(fx.root, ['src/legacy.ts']);
      assert.equal(configured.exitCode, 0, configured.output);
      assert.match(configured.output, /Effective lint\.scope=owned \(source=\.gennadyrc\)/);
      const strict = lint(fx.root, ['src/legacy.ts', '--scope=all']);
      assert.equal(strict.exitCode, 1, strict.output);
      assert.match(strict.output, /Effective lint\.scope=all \(source=CLI --scope all\)/);
      assert.match(strict.output, /Project lint\.scope=owned \(source=\.gennadyrc\)/);
      assert.doesNotMatch(strict.output, /scope: owned/);
      assert.equal(readFileSync(join(fx.root, 'gennady.yaml'), 'utf8'), yaml);
      assert.equal(readFileSync(join(fx.root, '.gennadyrc'), 'utf8'), rc);
      const help = lint(fx.root, ['--help']);
      assert.equal(help.exitCode, 0, help.output);
      assert.match(help.output, /--scope all.*Strengthen/);
      assert.match(help.output, /--scope owned is rejected/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('owned skips unowned legacy files but keeps headed and spec-declared files', () => {
    const fx = buildFixture();
    try {
      // Legacy code nobody owns yet: no header, no contracts.
      writeFileSync(
        join(fx.root, 'src', 'legacy.ts'),
        'export function legacy() {\n  return 1;\n}\n'
      );
      // New code that already claims an owner but breaks a contract rule.
      writeFileSync(
        join(fx.root, 'src', 'fresh.ts'),
        '// @file: Fresh module.\n// @spec: DEMO\n// @consumers: DemoApp\n\nexport function fresh() {\n  return 1;\n}\n'
      );

      const all = lint(fx.root);
      assert.equal(all.exitCode, 1, all.output);
      assert.match(all.output, /src\/legacy\.ts/);

      writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  scope: owned\n');
      const owned = lint(fx.root);
      assert.equal(owned.exitCode, 1, owned.output);
      assert.doesNotMatch(owned.output, /src\/legacy\.ts:\d/);
      assert.match(owned.output, /lint\.scope=owned: skipped 1 file\(s\)/);
      assert.match(owned.output, /src\/fresh\.ts:\d+:\d+: error/);

      // Removing the header does not hide a file its ticket still declares as a Target File.
      const greeter = join(fx.root, 'src', 'greeter.ts');
      writeFileSync(
        greeter,
        readFileSync(greeter, 'utf-8')
          .replace(/^\/\/ @spec: DEMO\n/m, '')
          .replace(/\/\*\*[\s\S]*?\*\/\n/, '')
      );
      const headerless = lint(fx.root);
      assert.match(
        headerless.output,
        /src\/greeter\.ts:\d+:\d+: error: ERR_DBC_LINT_MISSING_CONTRACT/
      );
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('checks every file when SDD declarations cannot be read completely', () => {
    const fx = buildFixture();
    try {
      writeFileSync(
        join(fx.root, 'src', 'legacy.ts'),
        'export function legacy() {\n  return 1;\n}\n'
      );
      writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  scope: owned\n');
      appendFileSync(
        join(fx.root, fx.specPath),
        '<!--SECTION:FILE_STRUCTURE-->\n\n**File Mapping:**\n\n- src/greeter.ts without backticks\n\n<!--/SECTION:FILE_STRUCTURE-->\n'
      );
      const result = lint(fx.root);
      assert.match(
        result.output,
        /lint\.scope=owned disabled for this run: \d+ SDD declaration error/
      );
      assert.match(result.output, /Effective lint\.scope=all \(source=SDD declaration fallback\)/);
      assert.match(result.output, /src\/legacy\.ts:\d+:\d+: error/);
      assert.doesNotMatch(result.output, /skipped \d+ file/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('counts only an @spec line in the leading comment block as ownership', () => {
    const fx = buildFixture();
    try {
      writeFileSync(
        join(fx.root, 'src', 'legacy.ts'),
        'export function legacy() {\n  // @spec: DEMO\n  return 1;\n}\n'
      );
      writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  scope: owned\n');
      const result = lint(fx.root);
      assert.match(result.output, /lint\.scope=owned: skipped 1 file\(s\)/);
      assert.doesNotMatch(result.output, /src\/legacy\.ts:\d/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('rejects an unknown scope value before linting', () => {
    const fx = buildFixture();
    try {
      writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  scope: legacy\n');
      const result = lint(fx.root);
      assert.equal(result.exitCode, 4, result.output);
      assert.match(result.output, /ERR_CLI_LINT_BAD_CONFIG/);
      assert.match(result.output, /lint\.scope: must be one of: all, owned — received "legacy"/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });
});
