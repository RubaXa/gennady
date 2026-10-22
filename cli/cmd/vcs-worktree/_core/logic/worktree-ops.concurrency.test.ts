// @file: Real-git regression for the shared-FETCH_HEAD race in prepareMrWorktree: several MRs of the
//   SAME project prepared concurrently on one clone must each check out their OWN head, not whichever
//   `git fetch` last wrote FETCH_HEAD. No network, no mocked git.
// @consumers: node:test runner
// @spec: CLI

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
  it('rechecks real Git connectivity after a locked in-progress linked HEAD becomes valid', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wt-head-window-'));
    const seed = join(root, 'seed');
    const origin = join(root, 'origin.git');
    const clone = join(root, 'clone');
    let repair: ReturnType<typeof setTimeout> | undefined;
    let prepared: ReturnType<typeof prepareMrWorktree> | undefined;
    try {
      mkdirSync(seed);
      git(['init', '--quiet'], seed);
      git(['config', 'user.email', 'race@example.test'], seed);
      git(['config', 'user.name', 'Race Fixture'], seed);
      writeFileSync(join(seed, 'a.txt'), 'base\n');
      git(['add', '-A'], seed);
      git(['commit', '--quiet', '-m', 'base'], seed);
      const head = git(['rev-parse', 'HEAD'], seed);
      git(['clone', '--quiet', '--bare', seed, origin], root);
      git(['update-ref', 'refs/merge-requests/1/head', head], origin);
      git(['clone', '--quiet', origin, clone], root);
      const registering = join(clone, '.git/worktrees/registering');
      mkdirSync(registering, { recursive: true });
      writeFileSync(join(registering, 'gitdir'), join(root, 'registering/.git') + '\n');
      writeFileSync(join(registering, 'locked'), 'initializing\n');
      writeFileSync(join(registering, 'HEAD'), '1'.repeat(40) + '\n');
      const red = spawnSync(
        'git',
        ['fetch', 'origin', '+merge-requests/1/head:refs/gennady/mr-head/1'],
        { cwd: clone, encoding: 'utf8', timeout: 5000 }
      );
      assert.notEqual(red.status, 0);
      assert.match(red.stderr, /^fatal: bad object worktrees\/registering\/HEAD$/m);
      // Model the other process finishing registration, without changing origin or the MR ref.
      repair = setTimeout(() => writeFileSync(join(registering, 'HEAD'), head + '\n'), 500);
      prepared = prepareMrWorktree(clone, '1', join(root, 'review'));
      const result = await prepared;
      assert.equal(result.headSha, head);
      assert.equal(git(['rev-parse', 'HEAD'], result.worktreePath), head);
    } finally {
      if (repair) clearTimeout(repair);
      if (prepared) await Promise.allSettled([prepared]);
      rmSync(root, { recursive: true, force: true });
    }
  });

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
