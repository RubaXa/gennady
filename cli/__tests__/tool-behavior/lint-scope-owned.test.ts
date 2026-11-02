// @file: Real-CLI proof that lint.scope=owned skips legacy files no SDD spec or ticket owns.
// @spec: CLI-LINT
// @consumers: CI

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { TEST_PROCESS_TIMEOUT_MS } from '../../../utils/test/process-budget.ts';
import { buildFixture } from '../directive-tool-contract/fixture.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function lint(cwd: string) {
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, GENNADY_ENTRY, 'lint', 'src'],
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
