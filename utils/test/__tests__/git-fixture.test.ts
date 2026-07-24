// @file: git-fixture.test — coverage for the real temp git repo fixture builder
// @consumers: none (test file)
// @tasks: TSK-147

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createGitFixture } from '#utils/test/git-fixture.ts';

/**
 * @purpose Substitute for `_classifyHeadChanged` (module-private in context-builder.ts, not
 *   exported — see AX_CONTRACT_OVER_IMPLEMENTATION). Asserts the exact git ancestry check the
 *   real function keys on: `git merge-base --is-ancestor <base> HEAD` exit code.
 * @param worktreePath Fixture worktree to check ancestry in.
 * @param baseSha Candidate ancestor SHA.
 * @returns `'fast_forward'` when `baseSha` is an ancestor of HEAD, `'rewritten'` otherwise.
 */
function classifyHeadChangedObservable(
  worktreePath: string,
  baseSha: string
): 'fast_forward' | 'rewritten' {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baseSha, 'HEAD'], {
      cwd: worktreePath,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return 'fast_forward';
  } catch {
    return 'rewritten';
  }
}

describe('createGitFixture', () => {
  it('should produce a fast_forward history between base and head', () => {
    const fixture = createGitFixture({ 'a.txt': 'base' }, { change: { 'a.txt': 'updated' } });

    try {
      assert.notStrictEqual(fixture.baseSha, '');
      assert.notStrictEqual(fixture.headSha, '');
      assert.notStrictEqual(fixture.baseSha, fixture.headSha);
      assert.strictEqual(
        classifyHeadChangedObservable(fixture.worktreePath, fixture.baseSha),
        'fast_forward'
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('should classify a rewritten history as rewritten', () => {
    const fixture = createGitFixture({ 'a.txt': 'base' }, { rewritten: true });

    try {
      assert.strictEqual(
        classifyHeadChangedObservable(fixture.worktreePath, fixture.baseSha),
        'rewritten'
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('should remove the temp tree on cleanup', () => {
    const fixture = createGitFixture({ 'a.txt': 'base' });

    fixture.cleanup();

    assert.throws(() =>
      execFileSync('git', ['status'], {
        cwd: fixture.worktreePath,
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    );
    assert.doesNotThrow(() => fixture.cleanup());
  });
});
