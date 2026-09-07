// @file: Integration tests for LintCommand#run — validates CLI arg parsing, file collection, and output.
// @consumers: gennady.ts
// @tasks: TSK-17, TSK-18

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
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

  it('autofix re-reads changed bytes before every read-only check', async () => {
    const filePath = writeFixture(
      'autofix-post-state.ts',
      [
        '// @file: Autofix post-state fixture.',
        '// @consumers: TestRunner',
        '',
        '/**',
        ' * @purpose Return the supplied value.',
        ' * @param value Supplied value.',
        ' * @param obsolete one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five.',
        ' * @returns Supplied value.',
        ' */',
        'export function identity(value: number): number { return value; }',
      ].join('\n')
    );

    const report = await mod.run(['node', 'gennady', 'lint', '--autofix', filePath]);

    assert.ok(report.autoFixed > 0);
    assert.strictEqual(report.exitCode, 0, report.format());
    assert.strictEqual(report.errors.length, 0);
    assert.doesNotMatch(readFileSync(filePath, 'utf-8'), /@param obsolete/);
  });

  it('--include-tests gives read-only and repair lint the same test-inclusive, non-contract-exclusive scope', async () => {
    const projectDir = join(tmpDir, 'include-tests-project');
    const testsDir = join(projectDir, 'nested', '__tests__');
    const fixturesDir = join(projectDir, 'fixtures');
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(fixturesDir, { recursive: true });
    writeFileSync(join(testsDir, 'broken.test.ts'), 'export const uncovered = 1;\n', 'utf-8');
    writeFileSync(join(fixturesDir, 'broken.fixture.ts'), 'export const fixture = 1;\n', 'utf-8');
    writeFileSync(join(projectDir, 'tool.config.ts'), 'export const config = 1;\n', 'utf-8');
    writeFileSync(join(projectDir, 'helper.mock.ts'), 'export const mock = 1;\n', 'utf-8');

    const defaultReport = await mod.run(['node', 'gennady', 'lint', '--autofix', projectDir]);
    const readOnlyReport = await mod.run([
      'node',
      'gennady',
      'lint',
      '--include-tests',
      projectDir,
    ]);
    const repairReport = await mod.run([
      'node',
      'gennady',
      'lint',
      '--autofix',
      '--include-tests',
      projectDir,
    ]);

    assert.strictEqual(defaultReport.exitCode, 0);
    assert.strictEqual(readOnlyReport.exitCode, 1);
    assert.strictEqual(repairReport.exitCode, 1);
    for (const report of [readOnlyReport, repairReport]) {
      assert.ok(report.errors.some((error) => error.file.endsWith('broken.test.ts')));
      assert.ok(report.errors.every((error) => !/fixture|config|mock/.test(error.file)));
    }
    assert.deepStrictEqual(
      [...new Set(readOnlyReport.errors.map((error) => error.file))].sort(),
      [...new Set(repairReport.errors.map((error) => error.file))].sort()
    );
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

  it('should reject unsupported explicit files while still processing supported files', async () => {
    const filePath = writeFixture('real.ts', 'import { z } from "./mod.ts";\n');
    const jsPath = writeFixture('unsupported.js', 'export const ignoredBefore = true;\n');

    const report = await mod.run(['node', 'gennady', 'lint', jsPath, filePath]);

    assert.strictEqual(report.exitCode, 1);
    const realErrors = report.errors.filter((e) => e.file === filePath);
    assert.ok(realErrors.length > 0);
    const unsupported = report.errors.filter((e) => e.file === jsPath);
    assert.strictEqual(unsupported.length, 1);
    assert.strictEqual(unsupported[0]?.code, 'ERR_CLI_LINT_UNSUPPORTED_TARGET');
    assert.match(unsupported[0]?.message ?? '', /only \.ts and \.tsx/);
  });

  it('should return typed nonzero evidence for an unreadable explicit production file', async (t) => {
    const filePath = writeFixture(
      'unreadable.ts',
      '// @file: Unreadable fixture.\n// @consumers: TestRunner\n'
    );
    chmodSync(filePath, 0o000);
    try {
      try {
        readFileSync(filePath, 'utf-8');
        t.skip('platform/user can still read chmod 000 files');
        return;
      } catch {
        // Permission denial is enforceable on this platform; exercise the fail-closed path.
      }
      const report = await mod.run(['node', 'gennady', 'lint', filePath]);
      assert.strictEqual(report.exitCode, 1);
      assert.strictEqual(report.errors.length, 1);
      assert.strictEqual(report.errors[0]?.code, 'ERR_CLI_LINT_READ_FAILED');
      assert.strictEqual(report.errors[0]?.file, filePath);
      assert.match(report.errors[0]?.message ?? '', /Cannot read lint target/);
      assert.match(report.errors[0]?.message ?? '', /Restore read permission/);
    } finally {
      chmodSync(filePath, 0o644);
    }
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

  it('should reject an unregistered flag instead of silently dropping it', async () => {
    const report = await mod.run(['node', 'gennady', 'lint', '--bogus-flag']);

    assert.strictEqual(report.exitCode, 4);
    assert.strictEqual(report.errors.length, 1);
    assert.strictEqual(report.errors[0]?.code, 'ERR_CLI_LINT_UNKNOWN_FLAG');
    assert.match(report.errors[0]?.message ?? '', /Unknown flag/);
    assert.match(report.errors[0]?.message ?? '', /usage: gennady lint/);
  });

  it('rejects repeated, missing, empty, and valued non-repeatable options before linting', async () => {
    const invalid = [
      ['--spec'],
      ['--spec='],
      ['--spec=a', '--spec=b'],
      ['--inventory-reverse=a', '--inventory-reverse=b'],
      ['--autofix', '--autofix'],
      ['--verbose=false'],
      ['--max-invariants=1', '--max-invariants=2'],
      ['--max-invariants=-1'],
      ['--max-invariants=1.5'],
      ['--max-invariants=4x'],
      ['--max-region-comments=-1'],
      ['--max-region-comments=1.5'],
      ['--max-region-comments=Infinity'],
      ['--exclude'],
      ['--exclude='],
    ];
    for (const flags of invalid) {
      const report = await mod.run(['node', 'gennady', 'lint', ...flags]);
      assert.strictEqual(report.exitCode, 4, `${flags.join(' ')}\n${report.format()}`);
      assert.match(report.format(), /usage: gennady lint/);
    }

    const target = writeFixture('must-not-autofix.ts', 'const untouched = 1;\n');
    const before = readFileSync(target, 'utf-8');
    const noMutation = await mod.run(['node', 'gennady', 'lint', target, '--autofix', '--autofix']);
    assert.strictEqual(noMutation.exitCode, 4);
    assert.strictEqual(readFileSync(target, 'utf-8'), before);
  });

  it('accepts repeatable non-empty excludes and numeric boundary values', async () => {
    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      '--exclude=a/**',
      '--exclude=b/**',
      '--max-invariants=1',
      '--max-region-comments=0',
    ]);
    assert.strictEqual(report.exitCode, 0, report.format());
  });

  it('typed word limits override the legacy global limit by category', async () => {
    const filePath = writeFixture(
      'word-precedence.ts',
      [
        '// @file: one two three four five',
        '// @consumers: Demo',
        '// @tasks: N/A',
        '',
        '/** @purpose one two three four five six seven eight */',
        'const value = 1;',
      ].join('\n')
    );
    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      filePath,
      '--max-words=4',
      '--max-header-words=5',
      '--max-contract-words=8',
    ]);
    assert.deepStrictEqual(
      report.errors.filter((error) => error.code === 'ERR_CLI_LINT_TAG_TOO_MANY_WORDS'),
      []
    );
  });

  it('legacy global word limit still applies where no typed override is present', async () => {
    const filePath = writeFixture(
      'word-global.ts',
      [
        '// @file: one two three four five',
        '// @consumers: Demo',
        '// @tasks: N/A',
        '',
        '/** @purpose one two three four five six seven eight */',
        'const value = 1;',
      ].join('\n')
    );
    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      filePath,
      '--max-words=4',
      '--max-contract-words=8',
    ]);
    const wordErrors = report.errors.filter(
      (error) => error.code === 'ERR_CLI_LINT_TAG_TOO_MANY_WORDS'
    );
    assert.strictEqual(wordErrors.length, 1);
    assert.match(wordErrors[0]?.message ?? '', /header @file/);
  });

  it('known word-limit flags reject malformed and non-positive values distinctly', async () => {
    for (const flag of ['--max-words=-1', '--max-header-words=0', '--max-contract-words=4x']) {
      const report = await mod.run(['node', 'gennady', 'lint', flag]);
      assert.strictEqual(report.exitCode, 4);
      assert.strictEqual(report.errors.length, 1);
      assert.strictEqual(report.errors[0]?.code, 'ERR_CLI_LINT_BAD_WORD_LIMIT');
      assert.match(report.errors[0]?.message ?? '', /requires a safe integer >= 1/);
      assert.match(report.errors[0]?.message ?? '', /usage: gennady lint/);
    }
  });

  it('--inventory-reverse without --spec is rejected', async () => {
    const report = await mod.run(['node', 'gennady', 'lint', '--inventory-reverse', tmpDir]);

    assert.strictEqual(report.exitCode, 4);
    assert.strictEqual(report.errors[0]?.code, 'ERR_CLI_LINT_INVENTORY_REVERSE_NEEDS_SPEC');
    assert.match(report.format(), /usage: gennady lint/);
  });

  it('--staged with a positional target is a bad invocation before linting', async () => {
    const target = writeFixture('staged-conflict.ts', 'const untouched = 1;\n');
    const before = readFileSync(target, 'utf-8');
    const report = await mod.run(['node', 'gennady', 'lint', target, '--staged', '--autofix']);
    assert.strictEqual(report.exitCode, 4);
    assert.strictEqual(report.errors[0]?.code, 'ERR_CLI_LINT_STAGED_CONFLICT');
    assert.match(report.format(), /usage: gennady lint/);
    assert.strictEqual(readFileSync(target, 'utf-8'), before);
  });

  it('--staged collects NUL-safe staged ACMR and untracked TypeScript while ignoring deletions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lint-staged-git-'));
    const previousCwd = process.cwd();
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    };
    try {
      git('init');
      writeFileSync(join(root, 'deleted.ts'), 'export const old = 1;\n');
      writeFileSync(join(root, 'rename-source.ts'), 'export const oldName = 1;\n');
      writeFileSync(join(root, 'modified.ts'), 'export const oldValue = 1;\n');
      git('add', '-A');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'base');

      unlinkSync(join(root, 'deleted.ts'));
      renameSync(join(root, 'rename-source.ts'), join(root, 'renamed file.ts'));
      writeFileSync(join(root, 'modified.ts'), 'export const changed = 2;\n');
      const stagedNewline = 'staged\nname.ts';
      writeFileSync(join(root, stagedNewline), 'export const stagedDirty = 1;\n');
      const untracked = 'untracked file.tsx';
      writeFileSync(join(root, untracked), 'export const untrackedDirty = 1;\n');
      git('config', 'status.showUntrackedFiles', 'no');
      git('add', '-A');
      git('reset', '--', untracked);
      process.chdir(root);

      const report = await mod.run(['node', 'gennady', 'lint', '--staged']);
      const selected = new Set(report.errors.map((error) => error.file));
      assert.ok(selected.has('modified.ts'), JSON.stringify(report.errors));
      assert.ok(selected.has('renamed file.ts'), JSON.stringify(report.errors));
      assert.ok(selected.has(stagedNewline), JSON.stringify(report.errors));
      assert.ok(selected.has(untracked), JSON.stringify(report.errors));
      assert.ok(!selected.has('deleted.ts'), JSON.stringify(report.errors));
    } finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--spec flags an export missing from the module Entity Inventory', async () => {
    const specPath = writeFixture(
      'mod.spec.md',
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '| `Declared` | Service | it is declared |',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n')
    );
    const filePath = writeFixture(
      'undeclared.ts',
      [
        '// @file: Undeclared export test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Declared entity. */',
        'export const Declared = 1;',
        '',
        '/** @purpose Undeclared entity — not in the inventory above. */',
        'export const Rogue = 2;',
      ].join('\n')
    );

    const report = await mod.run(['node', 'gennady', 'lint', `--spec=${specPath}`, filePath]);

    assert.ok(
      report.errors.some((e) => e.code === 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      JSON.stringify(report.errors)
    );
  });

  it('--spec excludes test exports from inventory while keeping ordinary test-code contracts active', async () => {
    const specPath = writeFixture(
      'test-scope.spec.md',
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '| `ProductionEntity` | Service | production entity |',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n')
    );
    const helperPath = writeFixture(
      'helper.test.ts',
      [
        '// @file: Test helper.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Provide a test-only helper. */',
        'export const TestHelper = 1;',
      ].join('\n')
    );
    const brokenTestPath = writeFixture(
      'broken-contract.test.ts',
      ['export const BrokenTestHelper = 1;'].join('\n')
    );

    const helper = await mod.run([
      'node',
      'gennady',
      'lint',
      '--include-tests',
      `--spec=${specPath}`,
      helperPath,
    ]);
    assert.ok(
      !helper.errors.some((error) => error.code === 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      helper.format()
    );
    assert.strictEqual(helper.exitCode, 0, helper.format());

    const broken = await mod.run([
      'node',
      'gennady',
      'lint',
      '--include-tests',
      `--spec=${specPath}`,
      brokenTestPath,
    ]);
    assert.strictEqual(broken.exitCode, 1);
    assert.ok(
      broken.errors.some((error) => error.code !== 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      broken.format()
    );
    assert.ok(
      !broken.errors.some((error) => error.code === 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      broken.format()
    );
  });

  it('--spec --inventory-reverse flags an inventory entity exported by no scanned file', async () => {
    const revDir = join(tmpDir, 'rev-mod');
    mkdirSync(revDir, { recursive: true });
    const specPath = join(revDir, 'mod.spec.md');
    writeFileSync(
      specPath,
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '| `Built` | Service | it exists |',
        '| `Ghost` | Service | it never got built |',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(revDir, 'code.ts'),
      [
        '// @file: Reverse sweep test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Built entity. */',
        'export const Built = 1;',
      ].join('\n'),
      'utf-8'
    );

    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      `--spec=${specPath}`,
      '--inventory-reverse',
      revDir,
    ]);

    assert.ok(
      report.errors.some(
        (e) => e.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' && e.message.includes('Ghost')
      ),
      JSON.stringify(report.errors)
    );
    assert.ok(
      !report.errors.some(
        (e) => e.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' && e.message.includes('Built')
      ),
      'Built is exported — must not be flagged unimplemented'
    );
  });

  it('--inventory-reverse does not count a test-only export as a production implementation', async () => {
    const revDir = join(tmpDir, 'reverse-ignores-tests');
    mkdirSync(revDir, { recursive: true });
    const specPath = join(revDir, 'mod.spec.md');
    writeFileSync(
      specPath,
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '| `OnlyInTest` | Service | must have production implementation |',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(revDir, 'only-in-test.test.ts'),
      [
        '// @file: Test-only export.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Test-only name collision. */',
        'export const OnlyInTest = 1;',
      ].join('\n'),
      'utf-8'
    );

    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      '--include-tests',
      `--spec=${specPath}`,
      '--inventory-reverse',
      revDir,
    ]);
    assert.ok(
      report.errors.some(
        (error) =>
          error.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' &&
          error.message.includes('OnlyInTest')
      ),
      report.format()
    );
    assert.ok(
      !report.errors.some((error) => error.code === 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      report.format()
    );
  });

  it('--spec --inventory-reverse: a Deferred Implementation to a NON-EXISTENT ticket is drift, not an exemption (B9)', async () => {
    const revDir = join(tmpDir, 'deferred-rev-mod');
    mkdirSync(revDir, { recursive: true });
    const specPath = join(revDir, 'mod.spec.md');
    writeFileSync(
      specPath,
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '| `Built` | Service | it exists |',
        '| `Later` | Service | Deferred Implementation: TSK-42 — next batch |',
        '| `Ghost` | Service | it never got built, no deferral |',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(revDir, 'code.ts'),
      [
        '// @file: Reverse sweep deferred-marker test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Built entity. */',
        'export const Built = 1;',
      ].join('\n'),
      'utf-8'
    );

    // Run with the CWD chdir'd INTO the tiny fixture dir: lint's deferral resolver scans the ticket
    // graph from process.cwd(), and we want it to scan this fixture (where TSK-42 is absent), NOT the
    // whole real repo — both to keep the assertion hermetic and to avoid a heavy repo-wide scan
    // racing under the parallel c8 runner.
    const origCwd = process.cwd();
    let report;
    try {
      process.chdir(revDir);
      report = await mod.run([
        'node',
        'gennady',
        'lint',
        `--spec=${specPath}`,
        '--inventory-reverse',
        revDir,
      ]);
    } finally {
      process.chdir(origCwd);
    }

    assert.ok(
      report.errors.some(
        (e) =>
          e.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' &&
          e.message.includes('Later') &&
          e.message.includes('TSK-42') &&
          /not valid/i.test(e.message)
      ),
      'Later defers to TSK-42, which owns no ticket in this graph — an invalid deferral is drift, not an exemption'
    );
    assert.ok(
      report.errors.some(
        (e) => e.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' && e.message.includes('Ghost')
      ),
      'Ghost carries no deferral marker — must still be flagged'
    );
  });

  // #4a structural ownership: an active same-scope ticket that only mentions the entity in PROSE
  // (not in Target Files / Implements) does NOT own the deferral → drift. A ticket that lists the
  // entity's file in Target Files DOES own it → honored.
  it('--spec --inventory-reverse: deferral ownership is structural (Target Files), not prose mention', async () => {
    const dir = join(tmpDir, 'own-rev-mod');
    mkdirSync(dir, { recursive: true });
    const specPath = join(dir, 'mod.spec.md');
    const writeSpec = () =>
      writeFileSync(
        specPath,
        [
          '# module: demo',
          '<!--SECTION:ENTITY_INVENTORY-->',
          '| Name | Type | Purpose |',
          '|---|---|---|',
          '| `FooService` | Service | Deferred Implementation: OWN-1 — next batch |',
          '<!--/SECTION:ENTITY_INVENTORY-->',
        ].join('\n'),
        'utf-8'
      );
    const ticket = (phaseBody: string) =>
      writeFileSync(
        join(dir, 'own.task.OWN-1.md'),
        [
          '# Task: OWN-1',
          '<!--SECTION:META-->',
          '- **Task-ID:** OWN-1',
          '- **Status:** [ ] TODO',
          '- **Scope:** demo',
          '<!--/SECTION:META-->',
          '<!--SECTION:PHASES_OVERVIEW-->',
          '| ID | Kind | Deps | Status |',
          '|----|------|------|--------|',
          '| P1 | impl | — | [ ] |',
          '<!--/SECTION:PHASES_OVERVIEW-->',
          '<!--SECTION:PHASE_P1-->',
          phaseBody,
          '<!--/SECTION:PHASE_P1-->',
          '<!--SECTION:EXECUTION_LOG-->',
          '<!--/SECTION:EXECUTION_LOG-->',
        ].join('\n'),
        'utf-8'
      );
    writeSpec();
    writeFileSync(
      join(dir, 'code.ts'),
      '// @file: x\n// @consumers: N/A\n// @tasks: N/A\n',
      'utf-8'
    );

    const run = async () => {
      const orig = process.cwd();
      try {
        process.chdir(dir);
        return await mod.run([
          'node',
          'gennady',
          'lint',
          `--spec=${specPath}`,
          '--inventory-reverse',
          dir,
        ]);
      } finally {
        process.chdir(orig);
      }
    };

    // PROSE-only mention (even with a differently-named file present) → not owned → drift.
    ticket(
      '- **Target Files:**\n  - src/foo-service.ts\n\nWe may need `FooService` eventually, but this ticket builds nothing of it.'
    );
    const prose = await run();
    assert.ok(
      prose.errors.some(
        (e) =>
          e.code === 'ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED' &&
          e.message.includes('FooService') &&
          /not valid/i.test(e.message)
      ),
      `prose-only ownership must be drift, got ${JSON.stringify(prose.errors)}`
    );

    // Structural ownership via an Entities field — file name (foo-service.ts) ≠ entity (FooService),
    // yet the explicit field proves ownership → honored (not flagged).
    ticket('- **Target Files:**\n  - src/foo-service.ts\n- **Entities:** FooService');
    const owned = await run();
    assert.ok(
      !owned.errors.some((e) => e.message.includes('FooService')),
      `Entities-field ownership must be honored, got ${JSON.stringify(owned.errors)}`
    );
  });

  it('--spec on a spec with no Entity Inventory section is vacuously clean (direct mode)', async () => {
    const specPath = writeFixture(
      'no-inventory.spec.md',
      ['# module: demo', '', 'No ENTITY_INVENTORY section in this spec at all.'].join('\n')
    );
    const filePath = writeFixture(
      'any-export.ts',
      [
        '// @file: File with exports but no inventory to check against.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Some export. */',
        'export const Anything = 1;',
        '',
        '/** @purpose Another export. */',
        'export const Something = 2;',
      ].join('\n')
    );

    const report = await mod.run(['node', 'gennady', 'lint', `--spec=${specPath}`, filePath]);

    assert.strictEqual(report.exitCode, 0);
    assert.ok(
      !report.errors.some((e) => e.code === 'ERR_CLI_LINT_INVENTORY_UNDECLARED'),
      'no Entity Inventory section means nothing to verify — must not flag every export'
    );
  });

  it('--spec --inventory-reverse on a spec with an empty Entity Inventory table is vacuously clean', async () => {
    const revDir = join(tmpDir, 'vacuous-rev-mod');
    mkdirSync(revDir, { recursive: true });
    const specPath = join(revDir, 'mod.spec.md');
    writeFileSync(
      specPath,
      [
        '# module: demo',
        '<!--SECTION:ENTITY_INVENTORY-->',
        '| Name | Type | Purpose |',
        '|---|---|---|',
        '<!--/SECTION:ENTITY_INVENTORY-->',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(revDir, 'code.ts'),
      [
        '// @file: Reverse sweep vacuous test file.',
        '// @consumers: TestRunner',
        '',
        '/** @purpose Some export. */',
        'export const Anything = 1;',
      ].join('\n'),
      'utf-8'
    );

    const report = await mod.run([
      'node',
      'gennady',
      'lint',
      `--spec=${specPath}`,
      '--inventory-reverse',
      revDir,
    ]);

    assert.strictEqual(report.exitCode, 0, JSON.stringify(report.errors));
    assert.strictEqual(report.errors.length, 0, JSON.stringify(report.errors));
  });

  it('excludes configs/mocks/fixtures by default; --include-all opts them back in (Problem 2)', async () => {
    const dir = join(tmpDir, 'excludes-mod');
    mkdirSync(dir, { recursive: true });
    // Each of these would violate DbC contracts (uncontracted export, no @file header) —
    // but as config / mock / fixture data they must never reach the linter by default.
    const dirty = ['export const wired = { a: 1 };', ''].join('\n');
    for (const name of ['app.config.ts', 'db.mock.ts', 'user.fixture.ts']) {
      writeFileSync(join(dir, name), dirty, 'utf-8');
    }

    const clean = await mod.run(['node', 'gennady', 'lint', dir]);
    assert.strictEqual(clean.exitCode, 0, JSON.stringify(clean.errors));
    assert.strictEqual(clean.errors.length, 0, JSON.stringify(clean.errors));

    const audited = await mod.run(['node', 'gennady', 'lint', '--include-all', dir]);
    assert.strictEqual(audited.exitCode, 1);
    assert.ok(
      audited.errors.length >= 3,
      `--include-all must surface the config/mock/fixture violations, got ${JSON.stringify(audited.errors)}`
    );
  });

  it('the fixture mask is *.fixture.*, not *fixture* — a production `fixture-service.ts` IS linted', async () => {
    const dir = join(tmpDir, 'fixture-name-mod');
    mkdirSync(dir, { recursive: true });
    // A real production file that merely has "fixture" in its name must NOT be excluded.
    writeFileSync(join(dir, 'fixture-service.ts'), 'export const wired = { a: 1 };\n', 'utf-8');
    const report = await mod.run(['node', 'gennady', 'lint', dir]);
    assert.strictEqual(report.exitCode, 1, JSON.stringify(report.errors));
    assert.ok(
      report.errors.some((e) => e.file.endsWith('fixture-service.ts')),
      `fixture-service.ts is production and must be linted, got ${JSON.stringify(report.errors)}`
    );
  });

  it('--include-all walks into __tests__ dirs (not just the glob tier) when a directory is given', async () => {
    const dir = join(tmpDir, 'include-tests-mod');
    mkdirSync(join(dir, '__tests__'), { recursive: true });
    writeFileSync(
      join(dir, '__tests__', 'broken.test.ts'),
      'export const wired = { a: 1 };\n',
      'utf-8'
    );

    // Default: __tests__ is skipped by the directory walk → clean.
    const def = await mod.run(['node', 'gennady', 'lint', dir]);
    assert.strictEqual(def.errors.length, 0, JSON.stringify(def.errors));

    // --include-all: the walk descends into __tests__ and the violation surfaces.
    const all = await mod.run(['node', 'gennady', 'lint', '--include-all', dir]);
    assert.ok(
      all.errors.some((e) => e.file.endsWith('broken.test.ts')),
      `--include-all must reach __tests__ files, got ${JSON.stringify(all.errors)}`
    );
  });
});
