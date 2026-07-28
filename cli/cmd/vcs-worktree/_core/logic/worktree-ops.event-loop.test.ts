// @file: D2 — real-git proof that worktree-ops' git calls are genuinely async (execFile, not
//   execFileSync): a tight timer keeps ticking WHILE a real worktree-removal git operation is in
//   flight, proving the event loop is never blocked for the duration of the call.
// @consumers: node:test runner
// @tasks: TSK-93

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createGitFixture } from '#utils/test/git-fixture.ts';
import { removeAllWorktrees } from './worktree-ops.logic.ts';

const execFileAsync = promisify(execFile);

describe('worktree-ops — event loop stays responsive during a real git call (D2)', () => {
  it('a tight timer ticks repeatedly while removeAllWorktrees runs a real git worktree remove', async () => {
    const fixture = createGitFixture({ 'a.ts': 'export const a = 1;\n' });
    const worktreesRoot = `${fixture.worktreePath}-worktrees`;

    // Several real worktrees, not one — one subprocess spawn resolves faster than a single 2ms
    // timer tick can even fire, which would show 0 ticks regardless of sync/async (too fast to
    // measure, not proof of blocking). Enough real git subprocess spawns to stretch this past a
    // handful of timer ticks if genuinely async.
    // removeAllWorktrees expects `<root>/<key>/worktree` (worktree.logic.ts's own layout).
    for (let i = 0; i < 8; i++) {
      await execFileAsync(
        'git',
        [
          '-C',
          fixture.worktreePath,
          'worktree',
          'add',
          '--detach',
          `${worktreesRoot}/wt${i}/worktree`,
        ],
        { encoding: 'utf-8' }
      );
    }

    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 2);

    let removed: string[];
    try {
      removed = await removeAllWorktrees(worktreesRoot);
    } finally {
      clearInterval(timer);
    }
    assert.strictEqual(removed.length, 8, 'all 8 real worktrees must have been removed');

    assert.ok(
      ticks > 5,
      `the 2ms timer must fire repeatedly WHILE the real git calls are in flight — got ${ticks} ` +
        'ticks; near-zero would mean the event loop was blocked (execFileSync, not execFile)'
    );

    fixture.cleanup();
  });
});
