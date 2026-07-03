// @file: Git worktree operations for read-only MR review (hooks disabled).
// @consumers: vcs-worktree.cmd
// @tasks: N/A

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** @purpose Result of preparing a read-only worktree for an MR. */
export type PreparedWorktree = {
  /** @purpose Absolute path to the detached worktree */
  worktreePath: string;
  /** @purpose Resolved head SHA of the MR */
  headSha: string;
};

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * @purpose Fetch the MR head and add a detached, hooks-disabled worktree for it.
 * @invariant Read-only: no checkout hooks run (core.hooksPath=/dev/null); nothing executed.
 * @param clonePath Local clone of the project.
 * @param iid Merge request internal ID.
 * @param worktreePath Absolute path where the worktree is created.
 * @returns The worktree path and resolved head SHA.
 * @sideEffect Network: git fetch; FS: creates the worktree directory.
 * @consumer vcs-worktree.cmd
 */
export function prepareMrWorktree(
  clonePath: string,
  iid: string,
  worktreePath: string
): PreparedWorktree {
  // Collision: a leftover worktree at this path → remove it and prune dangling meta.
  if (existsSync(worktreePath)) removeWorktreeSafe(worktreePath);
  git(['-C', clonePath, 'worktree', 'prune']);
  git([
    '-C',
    clonePath,
    '-c',
    'core.hooksPath=/dev/null',
    'fetch',
    'origin',
    `merge-requests/${iid}/head`,
  ]);
  const headSha = git(['-C', clonePath, 'rev-parse', 'FETCH_HEAD']);
  git([
    '-C',
    clonePath,
    '-c',
    'core.hooksPath=/dev/null',
    'worktree',
    'add',
    '--detach',
    worktreePath,
    headSha,
  ]);
  return { worktreePath, headSha };
}

/**
 * @purpose Fetch the MR target branch and return the merge-base for the review diff.
 * @invariant Only author's own changes appear in the diff — not master noise from merge-conflict resolution.
 *   Strategy: fetch target → merge-base(FETCH_HEAD, headSha). If shallow clone hides the ancestor, deepen
 *   and retry. If GitLab's diff_refs.base_sha is newer than our merge-base (e.g. after author's rebase),
 *   the merge-base is recalculated from the deeper history.
 * @param clonePath Local clone.
 * @param targetBranch MR target branch.
 * @param headSha Resolved MR head SHA.
 * @param [diffRefBase] GitLab API diff_refs.base_sha — used to detect stale merge-base after rebase.
 * @returns Base SHA to diff against (merge-base of target and head).
 * @sideEffect Network: git fetch of the target branch; may deepen a shallow clone.
 * @consumer vcs-worktree.cmd, inbox-context.cmd
 */
export function resolveBaseSha(
  clonePath: string,
  targetBranch: string,
  headSha: string,
  diffRefBase?: string
): string {
  git(['-C', clonePath, '-c', 'core.hooksPath=/dev/null', 'fetch', 'origin', targetBranch]);

  let mergeBase: string;
  try {
    mergeBase = git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
  } catch {
    // #region START_SHALLOW_DEEN — shallow clone: no common ancestor; unshallow and retry
    git([
      '-C',
      clonePath,
      '-c',
      'core.hooksPath=/dev/null',
      'fetch',
      '--unshallow',
      'origin',
      targetBranch,
    ]);
    mergeBase = git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
    // #endregion END_SHALLOW_DEEPEN
  }

  // #region START_REBASE_DETECT — if GitLab's diff_refs.base_sha is newer than merge-base, the author
  // rebased onto master; deepen history and recalculate so we diff from the actual new fork point.
  if (diffRefBase && diffRefBase !== mergeBase) {
    try {
      const isAncestor =
        git(['-C', clonePath, 'merge-base', '--is-ancestor', mergeBase, diffRefBase]) === '';
      if (isAncestor) {
        git([
          '-C',
          clonePath,
          '-c',
          'core.hooksPath=/dev/null',
          'fetch',
          '--deepen=500',
          'origin',
          targetBranch,
        ]);
        mergeBase = git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
      }
    } catch {
      // non-ancestor — keep the original mergeBase
    }
  }
  // #endregion END_REBASE_DETECT

  return mergeBase;
}

/**
 * @purpose Remove a worktree, deriving its owning clone from the worktree path.
 * @param worktreePath Worktree to remove.
 * @sideEffect FS: removes the worktree directory; prunes git metadata.
 * @consumer vcs-worktree.cmd
 */
export function removeWorktreeAt(worktreePath: string): void {
  const commonDir = git([
    '-C',
    worktreePath,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  git(['-C', dirname(commonDir), 'worktree', 'remove', '--force', worktreePath]);
}

/**
 * @purpose Best-effort removal: proper `git worktree remove`, falling back to a
 *   plain directory delete when the worktree metadata is broken.
 * @param worktreePath Worktree to remove.
 * @sideEffect FS: removes the directory; prunes git metadata when possible.
 * @consumer worktree GC
 */
export function removeWorktreeSafe(worktreePath: string): void {
  try {
    removeWorktreeAt(worktreePath);
  } catch {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      /* nothing more we can do */
    }
  }
}

/**
 * @purpose GC: remove worktrees under `root` whose mtime is older than `ttlMs`.
 *   Runs on every prepare so leaked worktrees cannot accumulate unbounded.
 * @param root Worktrees root directory.
 * @param ttlMs Max age in ms before a worktree is considered stale.
 * @param nowMs Current time in ms (injected for testability).
 * @returns Paths that were removed.
 * @sideEffect FS + git: removes stale worktree directories.
 * @consumer vcs-worktree.cmd
 */
export function gcStaleWorktrees(root: string, ttlMs: number, nowMs: number): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    let mtimeMs: number;
    try {
      const st = statSync(path);
      if (!st.isDirectory()) continue;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (nowMs - mtimeMs > ttlMs) {
      removeWorktreeSafe(path);
      removed.push(path);
    }
  }
  return removed;
}

/**
 * @purpose Remove every worktree under `root` (manual clean slate).
 * @param root Worktrees root directory.
 * @returns Paths that were removed.
 * @sideEffect FS + git: removes all worktree directories.
 * @consumer vcs-worktree.cmd
 */
export function removeAllWorktrees(root: string): string[] {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }
    removeWorktreeSafe(path);
    removed.push(path);
  }
  return removed;
}
