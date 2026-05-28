// @file: Integration tests for LintCommand#run — validates CLI arg parsing, file collection, and output.
// @consumers: gennady.ts
// @tasks: TSK-17, TSK-18

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

type LintModule = typeof import('../lint.cmd.ts');

let mod: LintModule;
let origExit: typeof process.exit;
let origArgv: string[];
let tmpDir: string;

/**
 * LintCommand Integration Test Graph:
 * ├── should exit 0 for clean file
 * ├── should exit 1 with ESLint format
 * ├── should show autoFixed count
 * ├── should aggregate multiple files
 * ├── should handle no files
 * ├── should skip missing files
 * ├── should filter by extension
 * └── should use consistent paths
 */

function writeFixture(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('LintCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'lint'];
    tmpDir = mkdtempSync(join(tmpdir(), 'lint-test-'));
    mod = await import('../lint.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should exit 0 for clean file', async () => {
    const filePath = writeFixture(
      'clean.ts',
      [
        '// @file: Clean test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose A test constant with valid contract. */',
        'export const VALUE = 42;',
      ].join('\n')
    );

    const report = await mod.run(['node', 'gennady', 'lint', filePath]);

    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.errors.length, 0);
  });

  it('should exit 1 with ESLint format', async () => {
    const filePath = writeFixture('dirty.ts', ['import { x } from "./mod.ts";'].join('\n'));

    const report = await mod.run(['node', 'gennady', 'lint', filePath]);

    assert.strictEqual(report.exitCode, 1);
    assert.ok(report.errors.length > 0);
    const formatted = report.format();
    assert.match(formatted, /dirty\.ts:\d+:\d+: error:/);
  });

  it('should show autoFixed count', async () => {
    // purpose: verify autofix mutates the file AND reports autoFixed count with remaining header errors in ESLint format
    // contract: run() with --autofix removes extra @param from the file, reports count, leaves non-fixable errors
    // failure mode: file not mutated → autofix is a no-op (tighten by checking content post-run)
    const filePath = writeFixture(
      'autofix.ts',
      [
        '/**',
        ' * @purpose Test function with extra @param.',
        ' * @param a First param.',
        ' * @param extra This param does not match signature.',
        ' * @returns Result.',
        ' */',
        'export function fn(a: number): number { return a; }',
      ].join('\n')
    );

    // #region START_AUTOFIX_TRIGGER_RUN
    const report = await mod.run(['node', 'gennady', 'lint', '--autofix', filePath]);
    // #endregion END_AUTOFIX_TRIGGER_RUN

    // #region START_AUTOFIX_ASSERT_RESULT
    assert.ok(report.autoFixed > 0, 'autoFixed should be > 0');
    const formatted = report.format();
    assert.match(formatted, /Auto-fixed: \d+ error\(s\)/);
    assert.match(formatted, /autofix\.ts:\d+:\d+: error:/);

    // verify file was mutated — @param extra should be removed
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(!content.includes('@param extra'), 'file should be mutated: @param extra removed');
    assert.ok(content.includes('@param a'), 'file should preserve valid @param a');
    assert.ok(content.includes('@returns Result'), 'file should preserve @returns');
    // #endregion END_AUTOFIX_ASSERT_RESULT
  });

  it('should aggregate multiple files', async () => {
    // purpose: verify one clean file produces no errors while a dirty file produces all errors
    // contract: exitCode 1 when at least one file has errors; clean files contribute zero errors
    const cleanPath = writeFixture(
      'clean-two.ts',
      [
        '// @file: Clean test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose A clean constant. */',
        'export const X = 1;',
      ].join('\n')
    );
    const dirtyPath = writeFixture('dirty-two.ts', ['import { y } from "./mod.ts";'].join('\n'));

    // #region START_AGGREGATE_TRIGGER_RUN
    const report = await mod.run(['node', 'gennady', 'lint', cleanPath, dirtyPath]);
    // #endregion END_AGGREGATE_TRIGGER_RUN

    // #region START_AGGREGATE_ASSERT_RESULT
    assert.strictEqual(report.exitCode, 1);
    const dirtyErrors = report.errors.filter((e) => e.file === dirtyPath);
    const cleanErrors = report.errors.filter((e) => e.file === cleanPath);
    assert.ok(dirtyErrors.length > 0);
    assert.strictEqual(cleanErrors.length, 0);
    // #endregion END_AGGREGATE_ASSERT_RESULT
  });

  it('should handle no files', async () => {
    const report = await mod.run(['node', 'gennady', 'lint']);

    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.errors.length, 0);
  });

  it('should skip missing files', async () => {
    // contract: non-existent file path produces ERR_CLI_LINT_RESOLVE_FAILED, exitCode 1 (errors present)
    // but command continues — no crash, no unhandled exception
    const report = await mod.run(['node', 'gennady', 'lint', 'nonexistent_file.ts']);

    assert.strictEqual(report.exitCode, 1);
    assert.ok(report.errors.length > 0, 'expected ERR_CLI_LINT_RESOLVE_FAILED');
    assert.ok(
      report.errors.every((e) => e.code === 'ERR_CLI_LINT_RESOLVE_FAILED'),
      'all errors should be resolve failures'
    );
  });

  it('should filter by extension', async () => {
    // purpose: verify non-.ts args are silently ignored while .ts args are processed
    // contract: only .ts files produce errors; non-.ts args contribute zero errors
    const filePath = writeFixture('real.ts', 'import { z } from "./mod.ts";\n');

    // #region START_FILTER_TRIGGER_RUN
    const report = await mod.run(['node', 'gennady', 'lint', 'readme.md', 'notes.txt', filePath]);
    // #endregion END_FILTER_TRIGGER_RUN

    // #region START_FILTER_ASSERT_RESULT
    assert.strictEqual(report.exitCode, 1);
    const realErrors = report.errors.filter((e) => e.file === filePath);
    assert.ok(realErrors.length > 0);
    assert.strictEqual(report.errors.length, realErrors.length);
    // #endregion END_FILTER_ASSERT_RESULT
  });

  it('should use consistent paths', async () => {
    // purpose: verify all 3 checks report the same filePath for a given argument
    // contract: every error.file equals the resolved absolute path of the input
    const subdirPath = join(tmpDir, 'subdir');
    mkdirSync(subdirPath);
    const fullPath = join(subdirPath, 'file.ts');
    writeFileSync(fullPath, 'import { w } from "./mod.ts";\n', 'utf-8');
    const relativePath = relative(process.cwd(), fullPath);

    // #region START_CONSISTENT_TRIGGER_RUN
    const report = await mod.run(['node', 'gennady', 'lint', relativePath]);
    // #endregion END_CONSISTENT_TRIGGER_RUN

    // #region START_CONSISTENT_ASSERT_RESULT
    assert.ok(report.errors.length > 0, 'expected errors in the file');
    for (const err of report.errors) {
      assert.strictEqual(err.file, fullPath, `expected ${fullPath}, got ${err.file}`);
    }
    // #endregion END_CONSISTENT_ASSERT_RESULT
  });
});
