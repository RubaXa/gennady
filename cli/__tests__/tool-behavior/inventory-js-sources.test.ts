// @file: Real-CLI proof that JavaScript File Mapping sources count for the reverse inventory sweep.
// @spec: CLI-LINT
// @consumers: CI

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { TEST_PROCESS_TIMEOUT_MS } from '../../../utils/test/process-budget.ts';
import { buildFixture } from '../directive-tool-contract/fixture.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GENNADY_ENTRY = join(REPO_ROOT, 'cli', 'gennady.ts');
const TSX_LOADER = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

function lint(cwd: string, args: readonly string[]) {
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

describe('reverse inventory over JavaScript sources', () => {
  it('reads exports of a .js File Mapping source without contract-linting it', () => {
    const fx = buildFixture();
    try {
      const spec = join(fx.root, fx.specPath);
      writeFileSync(
        spec,
        readFileSync(spec, 'utf-8').replace(
          '| `greet` | Function | Greets a person by name.  |',
          '| `greet` | Function | Greets a person by name.  |\n| `querystringAdd` | Function | Legacy JS helper. |'
        )
      );
      // Legacy JavaScript: no header, no JSDoc — contract lint must not touch it.
      writeFileSync(
        join(fx.root, 'src', 'querystring-add.js'),
        'export function querystringAdd() {}\n'
      );

      const withJs = lint(fx.root, [
        `--spec=${fx.specPath}`,
        '--inventory-reverse',
        'src',
        'src/greeter.ts',
        'src/querystring-add.js',
      ]);
      assert.equal(withJs.exitCode, 0, withJs.output);
      assert.doesNotMatch(withJs.output, /INVENTORY_UNIMPLEMENTED|UNSUPPORTED_TARGET|MISSING_FILE/);

      const withoutJs = lint(fx.root, [
        `--spec=${fx.specPath}`,
        '--inventory-reverse',
        'src',
        'src/greeter.ts',
      ]);
      assert.equal(withoutJs.exitCode, 1, withoutJs.output);
      assert.match(withoutJs.output, /ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED[^\n]*querystringAdd/);

      const plainLint = lint(fx.root, ['src/querystring-add.js']);
      assert.equal(plainLint.exitCode, 1, plainLint.output);
      assert.match(plainLint.output, /ERR_CLI_LINT_MISSING_FILE/);
      assert.doesNotMatch(plainLint.output, /ERR_CLI_LINT_UNSUPPORTED_TARGET/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });
});

it('does not accept a broken or dynamic source merely because another file supplied every declared entity', () => {
  const fx = buildFixture();
  try {
    for (const source of ['export const broken = ;', 'module.exports[key] = value;']) {
      writeFileSync(join(fx.root, 'src/unknown.js'), source);
      const result = lint(fx.root, [
        `--spec=${fx.specPath}`,
        '--inventory-reverse',
        'src',
        'src/greeter.ts',
        'src/unknown.js',
      ]);
      assert.equal(result.exitCode, 1, result.output);
      assert.match(result.output, /ERR_CLI_LINT_INVENTORY_INCOMPLETE/);
      assert.match(result.output, /unknown\.js/);
    }
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
