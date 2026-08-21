// @file: Unit tests for changed-files.ts — real git repos (no mocking: git behavior is deterministic),
//   covering getChangedFiles's unfiltered diff (added for sdd-task --group-scope, D-item "group-scope
//   underreports diff") alongside getChangedSourceFiles's pre-existing extension filter.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getChangedFiles, getChangedSourceFiles, hasGitHead } from '../changed-files.ts';

function initGitRepo(dir: string): void {
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  execSync('git add -A', { cwd: dir });
  execSync('git commit -q -m init', { cwd: dir });
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
    const files = getChangedFiles(dir);
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('notes.md'));
    assert.ok(files.includes('config.json'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(files.includes('extra.test.ts'));
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });

  it('getChangedSourceFiles keeps its pre-existing .ts/.tsx/.js filter (unchanged consumers)', () => {
    const files = getChangedSourceFiles(dir);
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(!files.includes('notes.md'));
    assert.ok(!files.includes('config.json'));
    assert.ok(!files.includes('extra.test.ts'), 'test files are excluded');
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });
});
