// @file: Real lint accepts JS/TS sources while retaining JavaScript JSDoc types and checking CommonJS callables.
// @spec: CLI-LINT
// @consumers: mixed source CLI qualification

import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFixture } from '../directive-tool-contract/fixture.ts';
import { runCli } from './run-cli.ts';

const header = '// @file: Value.\n// @spec: DEMO\n// @consumers: tests\n';
test('all eight JS/TS extensions are explicit supported lint targets', () => {
  const fx = buildFixture();
  try {
    const paths = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'].map(
      (extension) => `src/value.${extension}`
    );
    for (const path of paths)
      writeFileSync(
        join(fx.root, path),
        header + '/** @purpose Constant. */\nexport const VALUE = 1;\n'
      );
    const result = runCli(['lint', ...paths], fx.root);
    assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('CommonJS functions require a contract and JavaScript autofix preserves useful types', () => {
  const fx = buildFixture();
  try {
    const path = join(fx.root, 'src/echo.cjs');
    writeFileSync(path, header + 'exports.echo = name => name;\n');
    const missing = runCli(['lint', 'src/echo.cjs'], fx.root);
    assert.equal(missing.exitCode, 1);
    assert.match(missing.stdout, /MISSING_CONTRACT/);
    const documented =
      header +
      '/**\n * @purpose Echo a name.\n * @param {string} name Input name.\n * @returns {string} Same name.\n */\nexports.echo = name => name;\n';
    writeFileSync(path, documented);
    const good = runCli(['lint', '--autofix', 'src/echo.cjs'], fx.root);
    assert.equal(good.exitCode, 0, good.stdout + good.stderr);
    assert.equal(readFileSync(path, 'utf8'), documented);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
