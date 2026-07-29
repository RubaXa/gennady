// @file: Deterministic best-effort symlinking of known dependency directories into a prepared worktree.
// @consumers: worktree-ops.logic (prepareMrWorktree)
// @tasks: TSK-156

import { join } from 'node:path';

/**
 * @purpose Injected `node:fs` surface used by symlinking, kept out of a top-level import.
 * @invariant Callers wire real `node:fs` functions only at the composition root
 *   (`vcs-worktree.cmd.ts`); no other consumer of `prepareMrWorktree` is affected.
 */
export type WorktreeLinkFsDeps = {
  /**
   * @purpose Check whether a path exists
   * @param path Filesystem path to check
   * @returns True when the path exists
   */
  existsSync: (path: string) => boolean;
  /**
   * @purpose List directory entry names
   * @param path Directory to list
   * @returns Entry names directly under path
   */
  readdirSync: (path: string) => string[];
  /**
   * @purpose Read a file as text
   * @param path File to read
   * @param encoding Text encoding
   * @returns File content as a string
   */
  readFileSync: (path: string, encoding: 'utf8') => string;
  /**
   * @purpose Create a symlink
   * @param target Path the symlink points to
   * @param path Symlink location to create
   */
  symlinkSync: (target: string, path: string) => void;
};

/** @purpose Fixed candidate relative paths checked directly under the clone root, regardless of stack.
 *  @invariant Deliberately excludes `.env`/`.env.local`/`.env.development` — worktree checks out
 *    potentially untrusted MR code; secrets must never be reachable from it (see D-019). */
const STATIC_CANDIDATES = ['node_modules', 'vendor', '.venv', 'venv', '__pypackages__'] as const;

/** @purpose Monorepo root directories scanned one level deep for per-package `node_modules`, when a workspace is detected. */
const WORKSPACE_ROOT_DIRS = ['packages', 'apps'] as const;

/**
 * @purpose Detect whether the clone is a JS/TS monorepo workspace (pnpm or npm/yarn workspaces).
 * @param clonePath Absolute path to the source clone.
 * @param fsDeps Injected fs surface.
 * @returns True when `pnpm-workspace.yaml` exists or `package.json#workspaces` is set.
 */
function isWorkspaceClone(clonePath: string, fsDeps: WorktreeLinkFsDeps): boolean {
  if (fsDeps.existsSync(join(clonePath, 'pnpm-workspace.yaml'))) return true;
  try {
    const raw = fsDeps.readFileSync(join(clonePath, 'package.json'), 'utf8');
    return Boolean(JSON.parse(raw)?.workspaces);
  } catch {
    /* no package.json, unreadable, or malformed JSON — not a workspace */
    return false;
  }
}

/**
 * @purpose Enumerate `<root>/*\/node_modules` relative candidates for detected workspace roots.
 * @param clonePath Absolute path to the source clone.
 * @param fsDeps Injected fs surface.
 * @returns Relative paths (e.g. `packages/a/node_modules`) that may exist under the clone.
 */
function discoverWorkspacePackageCandidates(
  clonePath: string,
  fsDeps: WorktreeLinkFsDeps
): string[] {
  const candidates: string[] = [];
  for (const rootDir of WORKSPACE_ROOT_DIRS) {
    const rootPath = join(clonePath, rootDir);
    if (!fsDeps.existsSync(rootPath)) continue;
    let entries: string[];
    try {
      entries = fsDeps.readdirSync(rootPath);
    } catch {
      continue;
    }
    for (const entry of entries) candidates.push(join(rootDir, entry, 'node_modules'));
  }
  return candidates;
}

/**
 * @purpose Symlink one candidate from the clone into the worktree, isolating any failure.
 * @invariant Missing source → silent no-op (not every stack's dependency dirs exist).
 * @invariant Symlink failure (occupied destination, permission, etc.) is swallowed —
 *   caller relies on remaining candidates still being attempted.
 * @param clonePath Absolute path to the source clone.
 * @param worktreePath Absolute path to the prepared worktree.
 * @param relativePath Candidate path, relative to both clone and worktree roots.
 * @param fsDeps Injected fs surface.
 * @sideEffect FS: creates a symlink in the worktree pointing into the clone.
 */
function linkCandidate(
  clonePath: string,
  worktreePath: string,
  relativePath: string,
  fsDeps: WorktreeLinkFsDeps
): void {
  const source = join(clonePath, relativePath);
  if (!fsDeps.existsSync(source)) return;

  // #region START_BEST_EFFORT_SYMLINK — invariant: one candidate's failure (occupied
  // destination, permission, unsupported FS) never aborts the remaining candidates and
  // never escapes linkWorktreeDependencies.
  try {
    fsDeps.symlinkSync(source, join(worktreePath, relativePath));
  } catch {
    /* best-effort: destination occupied or unlinkable — skip this candidate only */
  }
  // #endregion END_BEST_EFFORT_SYMLINK
}

/**
 * @purpose Best-effort symlinking of known dependency paths from clone into worktree,
 *   making it runnable, not only readable.
 * @invariant Candidates fixed in code (Node/JS, Go, Python) plus workspace packages when
 *   detected; `.env*` permanently excluded (D-019) — worktree checks out untrusted MR code.
 * @invariant Never throws: each candidate is gated by `existsSync` and its own
 *   try/catch around `symlinkSync`, so no failure path is visible to the caller.
 * @invariant No top-level `node:fs` import — all fs access goes through the injected `fsDeps`.
 * @param clonePath Absolute path to the source clone.
 * @param worktreePath Absolute path to the freshly prepared worktree.
 * @param fsDeps Injected `node:fs` surface; real functions are wired only at the composition root.
 * @sideEffect FS: creates symlinks in the worktree pointing into the clone.
 * @consumer prepareMrWorktree
 */
export function linkWorktreeDependencies(
  clonePath: string,
  worktreePath: string,
  fsDeps: WorktreeLinkFsDeps
): void {
  for (const relativePath of STATIC_CANDIDATES) {
    linkCandidate(clonePath, worktreePath, relativePath, fsDeps);
  }

  // #region START_LINK_WORKSPACE_PACKAGES — invariant: only entered for detected pnpm/npm/yarn
  // workspaces; scans packages/*, apps/* one level deep for per-package node_modules
  if (isWorkspaceClone(clonePath, fsDeps)) {
    for (const relativePath of discoverWorkspacePackageCandidates(clonePath, fsDeps)) {
      linkCandidate(clonePath, worktreePath, relativePath, fsDeps);
    }
  }
  // #endregion END_LINK_WORKSPACE_PACKAGES
}
