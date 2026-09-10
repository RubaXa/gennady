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
 * @purpose Options for taking the guard.
 * @consumer gate-runner, verify.cmd
 */
export type TreeGuardOptions = {
  // An SDD phase agent has just edited its Target Files and is forbidden every git command, so it
  // can satisfy neither the clean precondition nor a "commit first" workaround. This mode is the
  // only one it can use.
  /**
   * @purpose Verify uncommitted work: no clean precondition, no drift detection, never resets.
   * @invariant No `reset` under any exit path — the dirt is the caller's unsaved work.
   */
  readonly wip?: boolean;
  /** @purpose Milliseconds to wait for a held lock before giving up; 0 fails immediately. */
  readonly lockWaitMs?: number;
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
 * @purpose Block until a held lock disappears, so contending runs serialise instead of failing.
 * @param lock Absolute lockfile path.
 * @param budgetMs Total time to wait; 0 means do not wait at all.
 * @returns True when the lock became free within the budget.
 * @sideEffect Process: blocks the thread in short sleeps.
 */
function waitForLockRelease(lock: string, budgetMs: number): boolean {
  const stepMs = 200;
  let waited = 0;
  while (waited < budgetMs) {
    const buffer = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buffer, 0, 0, Math.min(stepMs, budgetMs - waited));
    waited += stepMs;
    if (!fs.existsSync(lock)) {
      return true;
    }
  }
  return false;
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
 * @param [options] Guard mode; `wip` verifies uncommitted work, `lockWaitMs` queues on a held lock.
 * @returns The guard, or the refusal reason (dirty tree, live concurrent run).
 * @sideEffect IO: creates/removes the lockfile; may reset a crashed run's leftovers.
 */
export function acquireTreeGuard(
  toplevel: string,
  notice: (message: string) => void = (message) => console.error(message),
  options: TreeGuardOptions = {}
): GuardAcquisition {
  const wip = options.wip === true;
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
    const holderAlive = previous === null || pidAlive(previous.pid);

    const outlasted = holderAlive && waitForLockRelease(lock, options.lockWaitMs ?? 0);

    if (holderAlive && !outlasted) {
      return {
        kind: 'error',
        message: `another verify run holds the tree (lock: ${lock}${previous !== null ? `, pid ${previous.pid}` : ''}) — wait for it or remove the lock if you are sure it is dead`,
      };
    }

    // Only a DEAD holder leaves debris; one that finished while we waited cleaned up after itself.
    if (!outlasted && previous !== null && previous.cleanAtStart) {
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

  if (!wip) {
    const status = treeStatus(toplevel);
    if (status.length > 0) {
      fs.rmSync(lock, { force: true });
      return {
        kind: 'error',
        message: `DIRTY_TREE: uncommitted changes in ${toplevel} — verify runs only on a clean tree (commit or stash first):\n${status}`,
      };
    }
  }

  // `cleanAtStart` gates the crash-recovery reset above. In wip mode it stays false: the tree held
  // uncommitted work when we took the lock, so a later run must never "recover" it by resetting.
  fs.writeFileSync(
    lock,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cleanAtStart: !wip })
  );

  const reset = (): void => {
    if (wip) {
      // The dirt is the caller's unsaved work, not gate debris. Rolling back to HEAD here would
      // delete exactly what is being verified.
      return;
    }
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
      if (!wip && treeStatus(toplevel).length > 0) {
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
    // Drift means "a gate mutated a clean tree". With a dirty tree there is no baseline to
    // compare against, so wip reports no drift rather than reporting the caller's own edits.
    guard: { toplevel, drift: () => (wip ? '' : treeStatus(toplevel)), reset, release },
  };
}
