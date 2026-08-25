// @file: Unit tests for the clean-tree guard — precondition, lock, crash recovery, reset.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { acquireTreeGuard, treeStatus } = await import('../tree-guard.ts');

function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    stdio: 'ignore',
  });
}

function withRepo<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-guard-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'committed\n');
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'init');
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function lockPathOf(dir: string): string {
  return path.join(dir, '.git', 'gennady-verify.lock');
}

describe('acquireTreeGuard', () => {
  it('acquires on a clean tree; drift and reset round-trip; release removes the lock', () => {
    withRepo((dir) => {
      const acquisition = acquireTreeGuard(dir);
      assert.equal(acquisition.kind, 'guard', JSON.stringify(acquisition));
      if (acquisition.kind !== 'guard') return;
      const guard = acquisition.guard;
      assert.ok(fs.existsSync(lockPathOf(dir)), 'lock exists while held');

      fs.writeFileSync(path.join(dir, 'a.txt'), 'mutated\n');
      fs.writeFileSync(path.join(dir, 'junk.txt'), 'junk\n');
      assert.match(guard.drift(), /a\.txt/);
      assert.match(guard.drift(), /junk\.txt/);

      guard.reset();
      assert.equal(guard.drift(), '');
      assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8'), 'committed\n');
      assert.equal(fs.existsSync(path.join(dir, 'junk.txt')), false);

      guard.release();
      assert.equal(fs.existsSync(lockPathOf(dir)), false, 'lock removed on release');
    });
  });

  it('refuses a dirty tree without touching it, and leaves no lock behind', () => {
    withRepo((dir) => {
      fs.writeFileSync(path.join(dir, 'a.txt'), 'uncommitted work\n');
      const acquisition = acquireTreeGuard(dir);

      assert.equal(acquisition.kind, 'error');
      if (acquisition.kind !== 'error') return;
      assert.match(acquisition.message, /DIRTY_TREE/);
      assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8'), 'uncommitted work\n');
      assert.equal(fs.existsSync(lockPathOf(dir)), false);
    });
  });

  it('ignored-only dirt does not count as dirty', () => {
    withRepo((dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'cache/\n');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-qm', 'ignore');
      fs.mkdirSync(path.join(dir, 'cache'));
      fs.writeFileSync(path.join(dir, 'cache', 'x'), 'warm\n');

      const acquisition = acquireTreeGuard(dir);
      assert.equal(acquisition.kind, 'guard', JSON.stringify(acquisition));
      if (acquisition.kind === 'guard') {
        acquisition.guard.reset();
        assert.equal(
          fs.readFileSync(path.join(dir, 'cache', 'x'), 'utf-8'),
          'warm\n',
          'reset must never touch ignored paths (no -x)'
        );
        acquisition.guard.release();
      }
    });
  });

  it('refuses while a live run holds the lock', () => {
    withRepo((dir) => {
      // Our own pid is alive by definition — a second acquisition must refuse.
      fs.writeFileSync(
        lockPathOf(dir),
        JSON.stringify({ pid: process.pid, startedAt: 'x', cleanAtStart: true })
      );
      const acquisition = acquireTreeGuard(dir);
      assert.equal(acquisition.kind, 'error');
      if (acquisition.kind === 'error') {
        assert.match(acquisition.message, /another verify run holds the tree/);
      }
      fs.rmSync(lockPathOf(dir), { force: true });
    });
  });

  it('recovers from a crashed run: dead pid + clean-at-start ⇒ reset with a notice', () => {
    withRepo((dir) => {
      // Leftovers of a gate the dead run never rolled back.
      fs.writeFileSync(path.join(dir, 'a.txt'), 'gate debris\n');
      fs.writeFileSync(
        lockPathOf(dir),
        // pid 1 is init/launchd — kill(1, 0) from an unprivileged test yields EPERM (alive),
        // so use an unlikely-but-dead pid instead.
        JSON.stringify({ pid: 999999999, startedAt: 'x', cleanAtStart: true })
      );
      const notices: string[] = [];
      const acquisition = acquireTreeGuard(dir, (message) => notices.push(message));

      assert.equal(acquisition.kind, 'guard', JSON.stringify(acquisition));
      assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8'), 'committed\n');
      assert.ok(
        notices.some((notice) => notice.includes('recovering from a crashed run')),
        notices.join('\n')
      );
      if (acquisition.kind === 'guard') acquisition.guard.release();
    });
  });

  it('does NOT auto-reset after a crash that never verified cleanliness', () => {
    withRepo((dir) => {
      // The dead run crashed before its clean check — the dirt may be USER work.
      fs.writeFileSync(path.join(dir, 'a.txt'), 'user work\n');
      fs.writeFileSync(
        lockPathOf(dir),
        JSON.stringify({ pid: 999999999, startedAt: 'x', cleanAtStart: false })
      );
      const acquisition = acquireTreeGuard(dir, () => {});

      // The stale lock is cleared, but the dirty check then refuses normally.
      assert.equal(acquisition.kind, 'error');
      if (acquisition.kind === 'error') assert.match(acquisition.message, /DIRTY_TREE/);
      assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8'), 'user work\n');
    });
  });
});

describe('treeStatus', () => {
  it('reports tracked and untracked changes, and nothing on a clean tree', () => {
    withRepo((dir) => {
      assert.equal(treeStatus(dir), '');
      fs.writeFileSync(path.join(dir, 'new.txt'), 'x\n');
      assert.match(treeStatus(dir), /new\.txt/);
    });
  });
});
