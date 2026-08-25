// @file: Clean-tree guard — lock + clean precondition + drift/reset in the real tree (D-STACK-017).
// @consumers: gate-runner, verify.cmd
// @tasks: TSK-96

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * @purpose Guard over one git toplevel: gates run in the real tree, mutations show up in
 *   `git status` and roll back to HEAD (D-STACK-017).
 * @invariant `reset()` is exact because acquisition refused a dirty tree: pre-run state IS HEAD.
 * @consumer gate-runner
 */
export type TreeGuard = {
  /** @purpose Absolute git toplevel this guard protects. */
  readonly toplevel: string;
  /**
   * @purpose Detect gate mutations (ignored paths exempt).
   * @returns Porcelain status vs HEAD; empty when clean.
   */
  drift(): string;
  /** @purpose Roll the tree back to HEAD: `reset --hard` + `clean -fd` (no -x). */
  reset(): void;
  /** @purpose Final safety reset if dirty, then remove the lock and signal handlers. */
  release(): void;
};

/**
 * @purpose Result of taking the guard: a live guard, or the reason the tree cannot be guarded.
 * @consumer gate-runner, verify.cmd
 */
export type GuardAcquisition =
  | { readonly kind: 'guard'; readonly guard: TreeGuard }
  | { readonly kind: 'error'; readonly message: string };

/** Lockfile payload; `cleanAtStart` gates crash recovery (reset is only safe after the check). */
type LockPayload = {
  readonly pid: number;
  readonly startedAt: string;
  readonly cleanAtStart: boolean;
};

/**
 * @purpose Run git with argv in cwd; throws on failure.
 * @param args Git arguments.
 * @param cwd Working directory.
 * @returns Raw stdout.
 */
function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * @purpose Working-tree status vs HEAD, the guard's single source of truth.
 * @param toplevel Absolute git toplevel.
 * @returns Trimmed porcelain lines; empty string when clean.
 */
export function treeStatus(toplevel: string): string {
  return git(['status', '--porcelain'], toplevel).trim();
}

/**
 * @purpose True when the given pid belongs to a live process.
 * @param pid Process id from a lockfile.
 * @returns Liveness; EPERM counts as alive (the process exists under another user).
 */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * @purpose Per-worktree lock location — `.git` may be a file in linked worktrees,
 *   so the real gitdir is resolved instead of assuming a directory.
 * @param toplevel Absolute git toplevel.
 * @returns Absolute lockfile path.
 */
function lockPath(toplevel: string): string {
  const gitDir = git(['rev-parse', '--absolute-git-dir'], toplevel).trim();
  return path.join(gitDir, 'gennady-verify.lock');
}

/**
 * @purpose Take the clean-tree guard for one toplevel: lock, verify cleanliness, arm recovery.
 * @invariant `cleanAtStart` flips true only AFTER the clean check — recovery never resets user work.
 * @param toplevel Absolute git toplevel with a HEAD (the caller routes no-git/no-HEAD away).
 * @param [notice] Sink for the crash-recovery notice (default: console.error).
 * @returns The guard, or the refusal reason (dirty tree, live concurrent run).
 * @sideEffect IO: creates/removes the lockfile; may reset a crashed run's leftovers.
 */
export function acquireTreeGuard(
  toplevel: string,
  notice: (message: string) => void = (message) => console.error(message)
): GuardAcquisition {
  const lock = lockPath(toplevel);

  // #region START_LOCK — one verify per worktree; a leftover lock is a crash marker
  const takeLock = (payload: LockPayload): true | NodeJS.ErrnoException => {
    try {
      fs.writeFileSync(lock, JSON.stringify(payload), { flag: 'wx' });
      return true;
    } catch (error) {
      return error as NodeJS.ErrnoException;
    }
  };

  const first = takeLock({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cleanAtStart: false,
  });
  if (first !== true && first.code !== 'EEXIST') {
    // Unwritable gitdir: the guard cannot arm, and running unguarded would drop observe-only.
    return { kind: 'error', message: `cannot create the tree lock at ${lock}: ${first.message}` };
  }
  if (first !== true) {
    let previous: LockPayload | null = null;
    try {
      previous = JSON.parse(fs.readFileSync(lock, 'utf-8')) as LockPayload;
    } catch {
      previous = null; // Unreadable lock: treat as foreign and refuse below.
    }
    if (previous === null || pidAlive(previous.pid)) {
      return {
        kind: 'error',
        message: `another verify run holds the tree (lock: ${lock}${previous !== null ? `, pid ${previous.pid}` : ''}) — wait for it or remove the lock if you are sure it is dead`,
      };
    }
    // Dead holder that had verified cleanliness: leftovers belong to a gate, reset is safe.
    if (previous.cleanAtStart) {
      notice(
        `[verify] recovering from a crashed run (pid ${previous.pid}): git reset --hard && git clean -fd in ${toplevel}`
      );
      git(['reset', '--hard', '--quiet'], toplevel);
      git(['clean', '-fdq'], toplevel);
    }
    fs.rmSync(lock, { force: true });
    const retaken = takeLock({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cleanAtStart: false,
    });
    if (retaken !== true) {
      return { kind: 'error', message: `lost the race for the tree lock: ${lock}` };
    }
  }
  // #endregion END_LOCK

  const status = treeStatus(toplevel);
  if (status.length > 0) {
    fs.rmSync(lock, { force: true });
    return {
      kind: 'error',
      message: `DIRTY_TREE: uncommitted changes in ${toplevel} — verify runs only on a clean tree (commit or stash first):\n${status}`,
    };
  }

  // From here on, rolling back to HEAD is provably exact.
  fs.writeFileSync(
    lock,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cleanAtStart: true })
  );

  const reset = (): void => {
    git(['reset', '--hard', '--quiet'], toplevel);
    git(['clean', '-fdq'], toplevel);
  };

  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    try {
      if (treeStatus(toplevel).length > 0) {
        reset();
      }
    } finally {
      fs.rmSync(lock, { force: true });
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      process.removeListener('exit', onExit);
    }
  };
  // A gate killed mid-write must not leave debris: release on signals and process exit.
  const onSignal = (): void => {
    release();
    process.exit(130);
  };
  const onExit = (): void => release();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('exit', onExit);

  return {
    kind: 'guard',
    guard: { toplevel, drift: () => treeStatus(toplevel), reset, release },
  };
}
