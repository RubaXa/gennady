// @file: Tests for the strict `lint` config section and its effect on the lint command.
// @spec: CLI-LINT
// @consumers: LintCommand

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadLintConfig } from '../lint-config.ts';
import { ERR_CLI_LINT_BAD_CONFIG, ERR_CLI_LINT_NON_ENGLISH } from '../lint.types.ts';

type LintModule = typeof import('../lint.cmd.ts');

const RUSSIAN_JSDOC_SOURCE = [
  '// @file: Clean test file.',
  '// @consumers: TestRunner',
  '',
  '/** @purpose Тестовая константа с корректным контрактом. */',
  'export const VALUE = 42;',
  '',
].join('\n');

function project(yaml: string | null): { root: string; home: string } {
  const top = mkdtempSync(join(tmpdir(), 'lint-config-'));
  const root = join(top, 'repo');
  const home = join(top, 'home');
  mkdirSync(root);
  mkdirSync(home);
  if (yaml !== null) writeFileSync(join(root, 'gennady.yaml'), yaml, 'utf-8');
  writeFileSync(join(root, 'value.ts'), RUSSIAN_JSDOC_SOURCE, 'utf-8');
  return { root, home };
}

describe('loadLintConfig', () => {
  it('defaults to en without a lint section and accepts every documented value', () => {
    for (const [yaml, expected] of [
      [null, 'en'],
      ['verify:\n  presets: {}\n', 'en'],
      ['lint: {}\n', 'en'],
      ['lint:\n  commentLanguage: en\n', 'en'],
      ['lint:\n  commentLanguage: ru\n', 'ru'],
      ['lint:\n  commentLanguage: any\n', 'any'],
    ] as const) {
      const { root, home } = project(yaml);
      try {
        const loaded = loadLintConfig(root, home);
        assert.deepStrictEqual(loaded.errors, [], String(yaml));
        assert.strictEqual(loaded.commentLanguage, expected, String(yaml));
      } finally {
        rmSync(join(root, '..'), { recursive: true, force: true });
      }
    }
  });

  it('rejects an unknown value with the allowed list and an unknown key with a hint', () => {
    const { root, home } = project('lint:\n  commentLanguage: de\n  commentLanguge: ru\n');
    try {
      const loaded = loadLintConfig(root, home);
      assert.strictEqual(loaded.commentLanguage, 'en');
      assert.deepStrictEqual(
        loaded.errors.map((error) => error.path),
        ['lint.commentLanguge', 'lint.commentLanguage']
      );
      assert.match(loaded.errors[0]!.message, /did you mean "commentLanguage"/);
      assert.match(loaded.errors[1]!.message, /must be one of: en, ru, any — received "de"/);
    } finally {
      rmSync(join(root, '..'), { recursive: true, force: true });
    }
  });
});

describe('LintCommand with lint.commentLanguage', () => {
  let mod: LintModule;
  let previousHome: string | undefined;

  before(async () => {
    previousHome = process.env['HOME'];
    mod = await import('../lint.cmd.ts');
  });

  after(() => {
    if (previousHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = previousHome;
  });

  async function lintIn(yaml: string | null) {
    const { root, home } = project(yaml);
    const previousCwd = process.cwd();
    try {
      process.env['HOME'] = home;
      process.chdir(root);
      return await mod.run(['node', 'gennady', 'lint', 'value.ts']);
    } finally {
      process.chdir(previousCwd);
      rmSync(join(root, '..'), { recursive: true, force: true });
    }
  }

  it('keeps ERR_CLI_LINT_NON_ENGLISH for Russian JSDoc without config', async () => {
    const report = await lintIn(null);
    assert.strictEqual(report.exitCode, 1);
    assert.deepStrictEqual(
      [...new Set(report.errors.map((error) => error.code))],
      [ERR_CLI_LINT_NON_ENGLISH]
    );
  });

  it('accepts Russian JSDoc for commentLanguage ru and any', async () => {
    for (const language of ['ru', 'any']) {
      const report = await lintIn(`lint:\n  commentLanguage: ${language}\n`);
      assert.strictEqual(report.exitCode, 0, report.format());
      assert.deepStrictEqual(report.errors, []);
    }
  });

  it('stops before linting with exit 4 on an invalid value', async () => {
    const report = await lintIn('lint:\n  commentLanguage: russian\n');
    assert.strictEqual(report.exitCode, 4);
    assert.deepStrictEqual(
      report.errors.map((error) => [error.code, error.file]),
      [[ERR_CLI_LINT_BAD_CONFIG, 'gennady.yaml']]
    );
    assert.match(report.errors[0]!.message, /lint\.commentLanguage: must be one of: en, ru, any/);
  });
});

it('attributes a malformed lower-priority section to its actual source', () => {
  const { root, home } = project('lint:\n  commentLanguage: en\n');
  try {
    writeFileSync(join(home, '.gennadyrc'), '{"lint":"not-a-mapping"}');
    const loaded = loadLintConfig(root, home);
    assert.equal(loaded.errors[0]?.source, '~/.gennadyrc');
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true });
  }
});
