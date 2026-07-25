// @file: Git worktree operations for read-only MR review (hooks disabled).
// @consumers: vcs-worktree.cmd
// @tasks: TSK-93

import { execFile } from 'node:child_process';
import { readdir, stat, utimes, access } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout) => {
      if (err) return reject(err);
      resolve((stdout as string).trim());
    });
  });
}

/** @purpose Result of preparing a read-only worktree for an MR. */
export type PreparedWorktree = {
  /** @purpose Absolute path to the detached worktree */
  worktreePath: string;
  /** @purpose Resolved head SHA of the MR */
  headSha: string;
};

/** @purpose Worktree TTL: 7 days in ms | @invariant Equals 7 * 24 * 60 * 60 * 1000 */
export const WORKTREE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @purpose Fetch MR head and prepare a detached, hooks-disabled worktree.
 *   Reuses existing via fetch + reset; falls back to full recreate on failure.
 * @invariant Read-only: no checkout hooks run (core.hooksPath=/dev/null); nothing executed.
 * @invariant Reuse strategy: fetch → reset --hard FETCH_HEAD. Either failing triggers
 *   full delete + recreate. Mtime is touched on success (best-effort) for GC tracking.
 * @param clonePath Local clone of the project.
 * @param iid Merge request internal ID.
 * @param worktreePath Absolute path where the worktree is created.
 * @returns The worktree path and resolved head SHA.
 * @sideEffect Network: git fetch; FS: creates or reuses the worktree directory, updates mtime.
 * @consumer vcs-worktree.cmd
 */
export async function prepareMrWorktree(
  clonePath: string,
  iid: string,
  worktreePath: string
): Promise<PreparedWorktree> {
  const now = new Date();

  // #region START_REUSE_EXISTING_WORKTREE — invariant: fetch + reset avoids full recreate;
  // failure mode: stale FETCH_HEAD / lock / permission / reset mismatch → fall through to FULL_RECREATE
  // side effect: git fetch resets FETCH_HEAD in clone to MR head
  let wtExists = false;
  try {
    await access(worktreePath);
    wtExists = true;
  } catch {
    /* path does not exist */
  }
  if (wtExists) {
    try {
      await git([
        '-C',
        clonePath,
        '-c',
        'core.hooksPath=/dev/null',
        'fetch',
        'origin',
        `merge-requests/${iid}/head`,
      ]);
      const headSha = await git(['-C', clonePath, 'rev-parse', 'FETCH_HEAD']);
      await git(['-C', worktreePath, '-c', 'core.hooksPath=/dev/null', 'reset', '--hard', headSha]);
      const actualHead = await git(['-C', worktreePath, 'rev-parse', 'HEAD']);
      if (actualHead !== headSha) {
        throw new Error(
          `worktree reset mismatch: expected ${headSha.slice(0, 8)}, got ${actualHead.slice(0, 8)}`
        );
      }
      try {
        await utimes(worktreePath, now, now);
      } catch {
        /* best-effort mtime update */
      }
      return { worktreePath, headSha };
    } catch {
      /* fetch or reset failed → fall through to full recreate */
    }
  }
  // #endregion END_REUSE_EXISTING_WORKTREE

  // #region START_FULL_RECREATE_WORKTREE — invariant: delete any leftover + prune + fetch + add;
  // failure mode: all paths (fetch, rev-parse, worktree add) throw → propagates to caller
  if (wtExists) await removeWorktreeSafe(worktreePath);
  await git(['-C', clonePath, 'worktree', 'prune']);
  await git([
    '-C',
    clonePath,
    '-c',
    'core.hooksPath=/dev/null',
    'fetch',
    'origin',
    `merge-requests/${iid}/head`,
  ]);
  const headSha = await git(['-C', clonePath, 'rev-parse', 'FETCH_HEAD']);
  await git([
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
  try {
    await utimes(worktreePath, now, now);
  } catch {
    /* best-effort mtime update */
  }
  return { worktreePath, headSha };
  // #endregion END_FULL_RECREATE_WORKTREE
}

/**
 * @purpose Fetch the MR target branch and return the merge-base for the review diff.
 * @invariant Author's changes only — no master noise. Fetch target branch, compute
 *   merge-base. If shallow, deepen. If rebase detected, deepen and recalculate.
 * @param clonePath Local clone.
 * @param targetBranch MR target branch.
 * @param headSha Resolved MR head SHA.
 * @param [diffRefBase] GitLab API diff_refs.base_sha — used to detect stale merge-base after rebase.
 * @returns Base SHA to diff against (merge-base of target and head).
 * @sideEffect Network: git fetch of the target branch; may deepen a shallow clone.
 * @consumer vcs-worktree.cmd, inbox-context.cmd
 */
export async function resolveBaseSha(
  clonePath: string,
  targetBranch: string,
  headSha: string,
  diffRefBase?: string
): Promise<string> {
  await git(['-C', clonePath, '-c', 'core.hooksPath=/dev/null', 'fetch', 'origin', targetBranch]);

  let mergeBase: string;
  try {
    mergeBase = await git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
  } catch {
    // #region START_SHALLOW_DEEPEN — shallow clone: no common ancestor; unshallow and retry
    await git([
      '-C',
      clonePath,
      '-c',
      'core.hooksPath=/dev/null',
      'fetch',
      '--unshallow',
      'origin',
      targetBranch,
    ]);
    mergeBase = await git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
    // #endregion END_SHALLOW_DEEPEN
  }

  // #region START_REBASE_DETECT — if GitLab's diff_refs.base_sha is newer than merge-base, the author
  // rebased onto master; deepen history and recalculate so we diff from the actual new fork point.
  if (diffRefBase && diffRefBase !== mergeBase) {
    try {
      const result = await git([
        '-C',
        clonePath,
        'merge-base',
        '--is-ancestor',
        mergeBase,
        diffRefBase,
      ]);
      if (result === '') {
        await git([
          '-C',
          clonePath,
          '-c',
          'core.hooksPath=/dev/null',
          'fetch',
          '--deepen=500',
          'origin',
          targetBranch,
        ]);
        mergeBase = await git(['-C', clonePath, 'merge-base', 'FETCH_HEAD', headSha]);
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
 * @returns Resolves when the worktree is removed.
 * @sideEffect FS: removes the worktree directory; prunes git metadata.
 * @consumer vcs-worktree.cmd
 */
export async function removeWorktreeAt(worktreePath: string): Promise<void> {
  const commonDir = await git([
    '-C',
    worktreePath,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  await git(['-C', dirname(commonDir), 'worktree', 'remove', '--force', worktreePath]);
}

/**
 * @purpose Best-effort removal: proper `git worktree remove`, falling back to a
 *   plain directory delete when the worktree metadata is broken.
 * @param worktreePath Worktree to remove.
 * @returns Resolves when the worktree is removed.
 * @sideEffect FS: removes the directory; prunes git metadata when possible.
 * @consumer worktree GC
 */
export async function removeWorktreeSafe(worktreePath: string): Promise<void> {
  try {
    await removeWorktreeAt(worktreePath);
  } catch {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      /* nothing more we can do */
    }
  }
}

/**
 * @purpose GC: remove worktrees under `mrsRoot` whose mtime is older than `ttlMs`.
 *   Runs on every prepare so leaked worktrees cannot accumulate unbounded.
 * @invariant Targets the `worktree/` child of each `<mrsRoot>/<key>/`, leaving a sibling
 *   `report/` untouched (TSK-131: worktree and report share one parent, GC'd independently).
 * @param root MRs root (`mrsRoot`).
 * @param ttlMs Max age in ms before a worktree is considered stale.
 * @param nowMs Current time in ms (injected for testability).
 * @returns Paths that were removed.
 * @sideEffect FS + git: removes stale worktree directories.
 * @consumer vcs-worktree.cmd
 */
export async function gcStaleWorktrees(
  root: string,
  ttlMs: number,
  nowMs: number
): Promise<string[]> {
  let rootExists = false;
  try {
    await access(root);
    rootExists = true;
  } catch {
    /* root does not exist */
  }
  if (!rootExists) return [];
  const removed: string[] = [];
  const names = await readdir(root);
  for (const name of names) {
    const path = join(root, name, 'worktree');
    let mtimeMs: number;
    try {
      const st = await stat(path);
      if (!st.isDirectory()) continue;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (nowMs - mtimeMs > ttlMs) {
      await removeWorktreeSafe(path);
      removed.push(path);
    }
  }
  return removed;
}

/**
 * @purpose Remove every worktree under `mrsRoot` (manual clean slate).
 * @invariant Targets the `worktree/` child of each `<mrsRoot>/<key>/`, leaving `report/` untouched.
 * @param root MRs root (`mrsRoot`).
 * @returns Paths that were removed.
 * @sideEffect FS + git: removes all worktree directories.
 * @consumer vcs-worktree.cmd
 */
export async function removeAllWorktrees(root: string): Promise<string[]> {
  let rootExists = false;
  try {
    await access(root);
    rootExists = true;
  } catch {
    /* root does not exist */
  }
  if (!rootExists) return [];
  const removed: string[] = [];
  const names = await readdir(root);
  for (const name of names) {
    const path = join(root, name, 'worktree');
    try {
      const st = await stat(path);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    await removeWorktreeSafe(path);
    removed.push(path);
  }
  return removed;
}
