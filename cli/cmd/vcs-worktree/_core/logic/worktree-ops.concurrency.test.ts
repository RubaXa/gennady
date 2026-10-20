// @file: Real-git regression for the shared-FETCH_HEAD race in prepareMrWorktree: several MRs of the
//   SAME project prepared concurrently on one clone must each check out their OWN head, not whichever
//   `git fetch` last wrote FETCH_HEAD. No network, no mocked git.
// @consumers: node:test runner
// @spec: CLI

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareMrWorktree } from './worktree-ops.logic.ts';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

describe('prepareMrWorktree — concurrent prepares on one clone (FETCH_HEAD race)', () => {
  it('each MR checks out its own head when N MRs of one project are prepared in parallel', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wt-race-'));
    const seedPath = join(root, 'seed');
    const originPath = join(root, 'origin.git');
    const clonePath = join(root, 'clone');
    const MR_COUNT = 6;

    try {
      mkdirSync(seedPath);
      git(['init', '--quiet'], seedPath);
      git(['config', 'user.email', 'race@example.test'], seedPath);
      git(['config', 'user.name', 'Race Fixture'], seedPath);
      writeFileSync(join(seedPath, 'a.txt'), 'base\n');
      git(['add', '-A'], seedPath);
      git(['commit', '--quiet', '-m', 'base'], seedPath);

      const heads: string[] = [];
      for (let i = 0; i < MR_COUNT; i++) {
        writeFileSync(join(seedPath, 'a.txt'), `head-${i}\n`);
        git(['add', '-A'], seedPath);
        git(['commit', '--quiet', '-m', `head-${i}`], seedPath);
        heads.push(git(['rev-parse', 'HEAD'], seedPath));
      }

      git(['clone', '--quiet', '--bare', seedPath, originPath], root);
      for (let i = 0; i < MR_COUNT; i++) {
        git(['update-ref', `refs/merge-requests/${i + 1}/head`, heads[i]], originPath);
      }

      execFileSync('git', ['clone', '--quiet', originPath, clonePath], {
        encoding: 'utf8',
        stdio: 'ignore',
      });

      const worktrees = Array.from({ length: MR_COUNT }, (_, i) => join(root, `wt-${i + 1}`));
      const prepared = await Promise.all(
        worktrees.map((wt, i) => prepareMrWorktree(clonePath, String(i + 1), wt))
      );

      for (let i = 0; i < MR_COUNT; i++) {
        const actual = git(['rev-parse', 'HEAD'], prepared[i].worktreePath);
        assert.strictEqual(
          actual,
          heads[i],
          `MR ${i + 1} must check out its own head (${heads[i].slice(0, 8)}), got ${actual.slice(0, 8)}`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
