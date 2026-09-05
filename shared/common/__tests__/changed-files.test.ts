// @file: Unit tests for changed-files.ts — real git repos (no mocking: git behavior is deterministic),
//   covering getChangedFiles's unfiltered diff (added for sdd-task --group-scope, D-item "group-scope
//   underreports diff") alongside getChangedSourceFiles's pre-existing extension filter.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getChangedFiles, getChangedSourceFiles, hasGitHead } from '../changed-files.ts';

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('changed-files', () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'changed-files-'));
    writeFileSync(join(dir, 'README.md'), '# init\n', 'utf-8');
    initGitRepo(dir);
    // tracked source file, modified after commit
    writeFileSync(join(dir, 'src.ts'), '// changed\n', 'utf-8');
    // untracked files of assorted kinds
    writeFileSync(join(dir, 'notes.md'), '# notes\n', 'utf-8');
    writeFileSync(join(dir, 'config.json'), '{}\n', 'utf-8');
    writeFileSync(join(dir, 'extra.ts'), '// extra\n', 'utf-8');
    writeFileSync(join(dir, 'extra.test.ts'), '// test\n', 'utf-8');
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), '// vendored\n', 'utf-8');
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('hasGitHead is true once a commit exists', () => {
    assert.strictEqual(hasGitHead(dir), true);
  });

  it('getChangedFiles returns every changed file regardless of extension, excluding node_modules', () => {
    const result = getChangedFiles(dir);
    assert.strictEqual(result.status, 'ok');
    if (result.status === 'error') return;
    const files = result.files;
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('notes.md'));
    assert.ok(files.includes('config.json'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(files.includes('extra.test.ts'));
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });

  it('getChangedSourceFiles keeps its pre-existing .ts/.tsx/.js filter (unchanged consumers)', () => {
    const result = getChangedSourceFiles(dir);
    assert.strictEqual(result.status, 'ok');
    if (result.status === 'error') return;
    const files = result.files;
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(!files.includes('notes.md'));
    assert.ok(!files.includes('config.json'));
    assert.ok(!files.includes('extra.test.ts'), 'test files are excluded');
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });

  it('passes a root containing shell metacharacters as one argv value and executes no shell text', () => {
    const parent = mkdtempSync(join(tmpdir(), 'changed-files-argv-'));
    const marker = join(parent, 'SHOULD_NOT_EXIST');
    const hostile = join(parent, `repo-$(touch SHOULD_NOT_EXIST)-\`touch SHOULD_NOT_EXIST\``);
    mkdirSync(hostile);
    writeFileSync(join(hostile, 'tracked.ts'), 'before\n');
    initGitRepo(hostile);
    writeFileSync(join(hostile, 'tracked.ts'), 'after\n');
    const previous = process.cwd();
    try {
      process.chdir(parent);
      const result = getChangedFiles(hostile);
      assert.strictEqual(result.status, 'ok');
      if (result.status !== 'error') assert.deepStrictEqual(result.files, ['tracked.ts']);
      assert.throws(() => readFileSync(marker, 'utf-8'));
    } finally {
      process.chdir(previous);
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('aggregates staged, intent-to-add, untracked and NUL-sensitive names on an unborn branch', () => {
    const unborn = mkdtempSync(join(tmpdir(), 'changed-files-unborn-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: unborn });
      writeFileSync(join(unborn, 'staged.ts'), 'staged\n');
      writeFileSync(join(unborn, 'intent.ts'), 'intent\n');
      writeFileSync(join(unborn, 'untracked.ts'), 'untracked\n');
      writeFileSync(join(unborn, 'odd\nname.ts'), 'odd\n');
      execFileSync('git', ['add', 'staged.ts'], { cwd: unborn });
      execFileSync('git', ['add', '-N', 'intent.ts'], { cwd: unborn });
      const noHead = getChangedFiles(unborn);
      assert.strictEqual(noHead.status, 'no-head');
      if (noHead.status === 'no-head') {
        assert.deepStrictEqual(noHead.files, [
          'intent.ts',
          'odd\nname.ts',
          'staged.ts',
          'untracked.ts',
        ]);
      }
    } finally {
      rmSync(unborn, { recursive: true, force: true });
    }
  });

  it('preserves a staged deletion with a real HEAD and still distinguishes corrupt HEAD', () => {
    const deletion = mkdtempSync(join(tmpdir(), 'changed-files-deletion-'));
    const corrupt = mkdtempSync(join(tmpdir(), 'changed-files-corrupt-'));
    try {
      writeFileSync(join(deletion, 'deleted.ts'), 'before\n');
      initGitRepo(deletion);
      execFileSync('git', ['rm', '-q', 'deleted.ts'], { cwd: deletion });
      const deleted = getChangedFiles(deletion);
      assert.deepStrictEqual(deleted, { status: 'ok', files: ['deleted.ts'] });

      writeFileSync(join(corrupt, 'tracked.ts'), 'before\n');
      initGitRepo(corrupt);
      writeFileSync(join(corrupt, 'tracked.ts'), 'dirty\n');
      const branch = execFileSync('git', ['symbolic-ref', 'HEAD'], {
        cwd: corrupt,
        encoding: 'utf-8',
      }).trim();
      writeFileSync(join(corrupt, '.git', branch), `${'1'.repeat(40)}\n`);
      const broken = getChangedFiles(corrupt);
      assert.strictEqual(broken.status, 'error');
      if (broken.status === 'error') {
        assert.notStrictEqual(broken.exitCode, 0);
        assert.ok(broken.stderr.length > 0);
      }
    } finally {
      rmSync(deletion, { recursive: true, force: true });
      rmSync(corrupt, { recursive: true, force: true });
    }
  });
});
