// @file: git-diff-backed "what changed" helpers shared by sdd-check --changed and gennady yagni — both scope checks to the working diff against HEAD.
// @consumers: sdd-check.cmd, yagni.cmd
// @tasks: N/A

import { execSyncSafe } from './exec.ts';

/**
 * @purpose Changed source files (vs HEAD, plus untracked) under `root`. Test/spec files are excluded.
 * @param root Repository root.
 * @returns Repo-root-relative paths.
 */
export function getChangedSourceFiles(root: string): string[] {
  const diffOut = execSyncSafe(`git -C ${JSON.stringify(root)} diff --name-only HEAD 2>/dev/null`);
  const untrackedOut = execSyncSafe(
    `git -C ${JSON.stringify(root)} ls-files --others --exclude-standard 2>/dev/null`
  );
  const all = new Set(
    [...diffOut.split('\n'), ...untrackedOut.split('\n')].map((l) => l.trim()).filter(Boolean)
  );
  return [...all].filter(
    (p) =>
      /\.(ts|tsx|js)$/.test(p) && !/\.(test|spec)\.[jt]sx?$/.test(p) && !p.includes('node_modules/')
  );
}

/**
 * @purpose Every changed file (vs HEAD, plus untracked) under `root` — no extension filter, unlike
 *   `getChangedSourceFiles`; only `node_modules/` is excluded.
 * @param root Repository root.
 * @returns Repo-root-relative paths.
 */
export function getChangedFiles(root: string): string[] {
  const diffOut = execSyncSafe(`git -C ${JSON.stringify(root)} diff --name-only HEAD 2>/dev/null`);
  const untrackedOut = execSyncSafe(
    `git -C ${JSON.stringify(root)} ls-files --others --exclude-standard 2>/dev/null`
  );
  const all = new Set(
    [...diffOut.split('\n'), ...untrackedOut.split('\n')].map((l) => l.trim()).filter(Boolean)
  );
  return [...all].filter((p) => !p.includes('node_modules/'));
}

/**
 * @purpose Whether `root` has a git HEAD (≥1 commit) — else a naive caller mistakes every
 *   untracked file for "changed".
 * @param root Repository root.
 * @returns True when `git rev-parse --verify HEAD` succeeds.
 */
export function hasGitHead(root: string): boolean {
  const out = execSyncSafe(`git -C ${JSON.stringify(root)} rev-parse --verify HEAD 2>/dev/null`, {
    expectedExitCodes: [128, 1],
  });
  return out.trim().length > 0;
}

/**
 * @purpose Read a file's content at HEAD, or null when it has no HEAD version (new file).
 * @invariant Exit 128 (no HEAD version — new/untracked file) is expected, not an error — suppressed.
 * @param root Repository root.
 * @param relPath Repo-root-relative path.
 * @returns HEAD content, or null.
 */
export function getHeadContent(root: string, relPath: string): string | null {
  const out = execSyncSafe(
    `git -C ${JSON.stringify(root)} show HEAD:${JSON.stringify(relPath)} 2>/dev/null`,
    { expectedExitCodes: [128] }
  );
  return out ? out : null;
}
