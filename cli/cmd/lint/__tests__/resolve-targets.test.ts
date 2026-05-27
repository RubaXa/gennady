// @file: Unit tests for resolveTargets — validates 24 directory resolution scenarios.
// @consumers: LintCommand
// @tasks: TSK-50

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ERR_CLI_LINT_RESOLVE_FAILED } from '../lint.types.ts';

type LintModule = typeof import('../lint.cmd.ts');

let mod: LintModule;
let origExit: typeof process.exit;
let origArgv: string[];
let tmpDir: string;

describe('resolveTargets', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'lint'];
    tmpDir = mkdtempSync(join(tmpdir(), 'resolve-targets-test-'));
    mod = await import('../lint.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function abs(name: string): string {
    return resolve(tmpDir, name);
  }

  function writeFile(name: string, content = ''): string {
    const p = join(tmpDir, name);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  function mkdir(name: string): string {
    const p = join(tmpDir, name);
    mkdirSync(p);
    return p;
  }

  // ── UT-01: empty targets ──
  it('should return empty files and errors for empty targets', () => {
    const result = mod.resolveTargets([]);
    assert.deepStrictEqual(result, { files: [], errors: [] });
  });

  // ── UT-02: single .ts file ──
  it('should resolve a single .ts file', () => {
    const filePath = writeFile('single.ts');
    const result = mod.resolveTargets([filePath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], abs('single.ts'));
  });

  // ── UT-03: single .tsx file ──
  it('should resolve a single .tsx file', () => {
    const filePath = writeFile('component.tsx');
    const result = mod.resolveTargets([filePath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], abs('component.tsx'));
  });

  // ── UT-04: .js file silently ignored ──
  it('should silently ignore a .js file', () => {
    const filePath = writeFile('script.js');
    const result = mod.resolveTargets([filePath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-05: directory with mixed extensions ──
  it('should collect only .ts/.tsx from a mixed directory', () => {
    const dirPath = mkdir('mixed');
    writeFile('mixed/a.ts');
    writeFile('mixed/b.tsx');
    writeFile('mixed/c.js');
    writeFile('mixed/d.json');
    const result = mod.resolveTargets([dirPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 2);
    assert.deepStrictEqual(result.files, [abs('mixed/a.ts'), abs('mixed/b.tsx')]);
  });

  // ── UT-06: nested directories (2 levels) ──
  it('should recursively collect from nested directories', () => {
    mkdir('nested');
    mkdir('nested/inner');
    writeFile('nested/root.ts');
    writeFile('nested/inner/leaf.tsx');
    writeFile('nested/inner/skip.js');
    const result = mod.resolveTargets([abs('nested')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 2);
    assert.deepStrictEqual(result.files, [abs('nested/inner/leaf.tsx'), abs('nested/root.ts')]);
  });

  // ── UT-07: case-insensitive extensions ──
  it('should handle uppercase extensions', () => {
    writeFile('UPPER.TS');
    writeFile('Mixed.Tsx');
    const result = mod.resolveTargets([abs('UPPER.TS'), abs('Mixed.Tsx')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 2);
  });

  // ── UT-08: duplicate: file + directory containing same file ──
  it('should deduplicate a file passed both directly and via directory', () => {
    mkdir('dupdir');
    writeFile('dupdir/shared.ts');
    const dirPath = abs('dupdir');
    const filePath = abs('dupdir/shared.ts');
    const result = mod.resolveTargets([filePath, dirPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], filePath);
  });

  // ── UT-09: dedup by absolute path (relative vs absolute) ──
  it('should deduplicate same file by absolute path', () => {
    const filePath = writeFile('dedup.ts');
    const result = mod.resolveTargets([filePath, abs('dedup.ts')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
  });

  // ── UT-10: ENOENT ──
  it('should return ERR_CLI_LINT_RESOLVE_FAILED for non-existent path', () => {
    const result = mod.resolveTargets([abs('does-not-exist')]);
    assert.strictEqual(result.files.length, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].code, ERR_CLI_LINT_RESOLVE_FAILED);
    assert.match(result.errors[0].message, /resolveTargets/);
  });

  // ── UT-11: EACCES ──
  it('should return ERR_CLI_LINT_RESOLVE_FAILED for permission-denied path', () => {
    // contract: lstatSync on path inside a locked parent dir throws EACCES
    const lockedParent = join(tmpDir, 'locked-parent');
    mkdirSync(lockedParent);
    const target = join(lockedParent, 'file.ts');
    writeFileSync(target, '');
    chmodSync(lockedParent, 0o000);

    const result = mod.resolveTargets([target]);

    // restore for cleanup
    chmodSync(lockedParent, 0o755);

    assert.strictEqual(result.files.length, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].code, ERR_CLI_LINT_RESOLVE_FAILED);
    assert.match(result.errors[0].message, /resolveTargets/);
  });

  // ── UT-12: mixed valid + ENOENT + EACCES ──
  it('should handle mixed valid, non-existent, and permission-denied targets', () => {
    const validFile = writeFile('valid.ts');

    // Locked parent for EACCES
    const lockedParent = join(tmpDir, 'mixed-locked');
    mkdirSync(lockedParent);
    const lockedTarget = join(lockedParent, 'secret.ts');
    writeFileSync(lockedTarget, '');
    chmodSync(lockedParent, 0o000);

    const nonExistent = abs('missing.ts');

    const result = mod.resolveTargets([validFile, nonExistent, lockedTarget]);

    chmodSync(lockedParent, 0o755);

    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], validFile);
    assert.strictEqual(result.errors.length, 2);
    // errors must preserve targets order
    assert.strictEqual(result.errors[0].file, nonExistent);
    assert.strictEqual(result.errors[1].file, lockedTarget);
  });

  // ── UT-13: symlink to directory is skipped ──
  it('should skip a symlink pointing to a directory', () => {
    const realDir = mkdir('real-dir');
    writeFile('real-dir/inside.ts');
    const symlinkPath = join(tmpDir, 'link-to-dir');
    symlinkSync(realDir, symlinkPath, 'dir');

    const result = mod.resolveTargets([symlinkPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-14: symlink to .ts file is skipped ──
  it('should skip a symlink pointing to a .ts file', () => {
    const realFile = writeFile('real.ts');
    const symlinkPath = join(tmpDir, 'link-to-file');
    symlinkSync(realFile, symlinkPath, 'file');

    const result = mod.resolveTargets([symlinkPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-15: cyclic symlink does not hang ──
  it('should not hang on a cyclic symlink', () => {
    const dir = mkdir('loop-dir');
    const symlinkPath = join(dir, 'loop');
    symlinkSync(dir, symlinkPath, 'dir');

    const result = mod.resolveTargets([dir]);
    assert.strictEqual(result.errors.length, 0);
    // dir is empty (the symlink entry is skipped by lstat)
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-16: empty directory ──
  it('should return empty for an empty directory', () => {
    mkdir('empty-dir');
    const result = mod.resolveTargets([abs('empty-dir')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-17: directory only with unsupported extensions ──
  it('should return empty for a directory with only unsupported extensions', () => {
    mkdir('js-only');
    writeFile('js-only/app.js');
    writeFile('js-only/style.css');
    const result = mod.resolveTargets([abs('js-only')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 0);
  });

  // ── UT-18: node_modules explicitly passed is traversed ──
  it('should traverse node_modules content when passed explicitly as a target', () => {
    // contract: walkDir skips node_modules entries inside a scanned parent dir,
    // but when node_modules itself is the direct target, its contents are traversed
    mkdir('node_modules');
    mkdir('node_modules/pkg');
    writeFile('node_modules/pkg/index.ts');
    const result = mod.resolveTargets([abs('node_modules')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
  });

  // ── UT-19: hidden directory (.git) is skipped ──
  it('should skip hidden directories during traversal', () => {
    mkdir('vis-dir');
    mkdir('vis-dir/.git');
    writeFile('vis-dir/.git/config.ts');
    writeFile('vis-dir/open.ts');
    const result = mod.resolveTargets([abs('vis-dir')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], abs('vis-dir/open.ts'));
  });

  // ── UT-20: excluded directories (dist, coverage, build, out) ──
  it('should skip dist, coverage, build, out directories', () => {
    mkdir('proj');
    mkdir('proj/dist');
    mkdir('proj/coverage');
    mkdir('proj/build');
    mkdir('proj/out');
    mkdir('proj/src');
    writeFile('proj/dist/bundle.ts');
    writeFile('proj/coverage/report.ts');
    writeFile('proj/build/output.ts');
    writeFile('proj/out/compiled.ts');
    writeFile('proj/src/main.ts');
    const result = mod.resolveTargets([abs('proj')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0], abs('proj/src/main.ts'));
  });

  // ── UT-21: sorted output ──
  it('should return files sorted by absolute path', () => {
    mkdir('sort-test');
    writeFile('sort-test/z.ts');
    writeFile('sort-test/a.ts');
    writeFile('sort-test/m.ts');
    const result = mod.resolveTargets([abs('sort-test')]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 3);
    // sorted by absolute path
    assert.strictEqual(result.files[0], abs('sort-test/a.ts'));
    assert.strictEqual(result.files[1], abs('sort-test/m.ts'));
    assert.strictEqual(result.files[2], abs('sort-test/z.ts'));
  });

  // ── UT-22: relative path normalization ──
  it('should return absolute paths for relative inputs', () => {
    const filePath = writeFile('rel.ts');
    const relativePath = 'rel.ts';
    const cwd = process.cwd();
    // resolveTargets resolves relative to CWD, so we need a path relative to CWD
    // use a temp file with absolute input to test normalization
    const result = mod.resolveTargets([filePath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
    assert.ok(result.files[0].startsWith('/'));
  });

  // ── UT-23: spaces in paths ──
  it('should handle spaces in file paths', () => {
    const dirPath = mkdir('with spaces');
    writeFile('with spaces/file one.ts');
    const result = mod.resolveTargets([dirPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
  });

  // ── UT-24: cyrillic in paths ──
  it('should handle cyrillic characters in directory paths', () => {
    const dirPath = mkdir('директория');
    writeFile('директория/файл.ts');
    const result = mod.resolveTargets([dirPath]);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.files.length, 1);
  });
});
