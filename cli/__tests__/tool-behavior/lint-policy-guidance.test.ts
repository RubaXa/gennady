// @file: Real CLI policy diagnostics let agents propose a working config change without mutating it.
// @spec: CLI-LINT
// @consumers: brownfield integration qualification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { buildFixture } from '../directive-tool-contract/fixture.ts';
import { cleanTestChildEnv, runCli } from './run-cli.ts';

const repository = resolve(import.meta.dirname, '../../..');
const source =
  '// @file: Value.\n// @spec: DEMO\n// @consumers: tests\n/** @purpose Русский контракт значения. */\nexport const VALUE = 42;\n';

function invoke(root: string, nested = false) {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      join(repository, 'node_modules/tsx/dist/loader.mjs'),
      join(repository, 'cli/gennady.ts'),
      'lint',
      nested ? 'value.ts' : 'src/value.ts',
    ],
    {
      cwd: nested ? join(root, 'src') : root,
      encoding: 'utf8',
      timeout: 30_000,
      env: cleanTestChildEnv({ ...process.env, HOME: root }),
    }
  );
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
}

test('language error explains default, actionable proposal, consent and repeat without editing config', () => {
  const fx = buildFixture();
  try {
    writeFileSync(join(fx.root, 'src/value.ts'), source);
    const result = invoke(fx.root);
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /effective lint.commentLanguage=en/i);
    assert.match(result.output, /commentLanguage: ru/);
    assert.match(result.output, /consent/i);
    writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  commentLanguage: ru\n');
    assert.equal(invoke(fx.root).exitCode, 0);
    assert.equal(
      readFileSync(join(fx.root, 'gennady.yaml'), 'utf8'),
      'lint:\n  commentLanguage: ru\n'
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('repo rc override is the actual source and proposal target; nested cwd uses project config', () => {
  const fx = buildFixture();
  try {
    writeFileSync(join(fx.root, 'src/value.ts'), source);
    writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  commentLanguage: ru\n');
    assert.equal(invoke(fx.root, true).exitCode, 0);
    writeFileSync(join(fx.root, '.gennadyrc'), '{"lint":{"commentLanguage":"en"}}');
    const result = invoke(fx.root, true);
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /source=\.gennadyrc/);
    assert.match(result.output, /"commentLanguage": "ru"/);
    assert.equal(
      readFileSync(join(fx.root, '.gennadyrc'), 'utf8'),
      '{"lint":{"commentLanguage":"en"}}'
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('scope diagnostics propose explicit adoption policy without hiding declared files or editing config', () => {
  const fx = buildFixture();
  try {
    writeFileSync(join(fx.root, 'src/neighbor.ts'), 'export const neighbor = 1;\n');
    const initial = runCli(['lint', 'src'], fx.root);
    assert.equal(initial.exitCode, 1);
    assert.match(initial.stdout, /Effective lint.scope=all \(source=default\)/);
    assert.match(initial.stdout, /scope: owned/);
    assert.match(initial.stdout, /consent/i);
    assert.equal(existsSync(join(fx.root, 'gennady.yaml')), false);
    writeFileSync(join(fx.root, 'gennady.yaml'), 'lint:\n  scope: owned\n');
    const owned = runCli(['lint', 'src'], fx.root);
    assert.equal(owned.exitCode, 0, owned.stdout + owned.stderr);
    assert.match(owned.stdout, /skipped 1 file/);
    writeFileSync(join(fx.root, 'src/greeter.ts'), 'export const brokenDeclared = 1;\n');
    const declared = runCli(['lint', 'src'], fx.root);
    assert.equal(declared.exitCode, 1);
    assert.match(declared.stdout, /greeter\.ts.*ERR_CLI_LINT_MISSING_FILE/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
