// @file: Argv-safe, fail-closed git evidence for changed-file and HEAD-baseline consumers.
// @consumers: sdd-check.cmd, sdd-task.cmd, yagni.cmd
// @tasks: N/A

import { spawnSync } from 'node:child_process';

/** @purpose Stable diagnostic from one failed git subprocess. */
export type GitCommandError = {
  /** @purpose Human-readable operation that could not be proven. */
  operation: string;
  /** @purpose Git process exit status; null means spawn/termination failure. */
  exitCode: number | null;
  /** @purpose Git stderr (or the spawn error), preserved for the caller's teaching error. */
  stderr: string;
};

/** @purpose Changed-file evidence with unborn HEAD distinguished from a broken repository. */
export type ChangedFilesResult =
  | { status: 'ok'; files: string[] }
  | { status: 'no-head'; files: string[] }
  | ({ status: 'error' } & GitCommandError);

type GitResult = { ok: true; stdout: string; stderr: string } | ({ ok: false } & GitCommandError);

function git(root: string, operation: string, args: string[]): GitResult {
  const child = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const stderr = child.error?.message || child.stderr || '';
  if (child.status !== 0 || child.error) {
    return {
      ok: false,
      operation,
      exitCode: child.status,
      stderr: stderr.trim(),
    };
  }
  return { ok: true, stdout: child.stdout ?? '', stderr: stderr.trim() };
}

type HeadState = { status: 'ok' | 'no-head' } | ({ status: 'error' } & GitCommandError);

/** @purpose Prove a usable HEAD, or prove the one accepted exception: an unborn symbolic branch. */
function headState(root: string): HeadState {
  const repository = git(root, 'discover repository', ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok) return { status: 'error', ...repository };
  if (repository.stdout.trim() !== 'true') {
    return {
      status: 'error',
      operation: 'discover repository',
      exitCode: null,
      stderr: 'git did not identify the target as a working tree',
    };
  }

  const head = git(root, 'resolve HEAD commit', ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (head.ok) return { status: 'ok' };

  // `rev-parse` exit 128 is not enough: corrupt/detached HEAD can fail the same way. An unborn
  // repository is exactly a symbolic branch whose ref is absent from the ref database.
  const symbolic = git(root, 'resolve symbolic HEAD', ['symbolic-ref', '-q', 'HEAD']);
  if (!symbolic.ok) return { status: 'error', ...head };
  const branch = symbolic.stdout.trim();
  if (!branch.startsWith('refs/heads/')) return { status: 'error', ...head };
  const branchRef = git(root, 'inspect symbolic HEAD branch', [
    'show-ref',
    '--verify',
    '--quiet',
    branch,
  ]);
  if (!branchRef.ok && branchRef.exitCode === 1) return { status: 'no-head' };
  return { status: 'error', ...(branchRef.ok ? head : branchRef) };
}

function nulPaths(stdout: string): string[] {
  return stdout.split('\0').filter(Boolean);
}

/** @purpose Deterministic union of NUL-decoded repository paths, excluding dependency territory. */
function changedPathUnion(...groups: string[][]): string[] {
  return [...new Set(groups.flat())]
    .filter((path) => !path.includes('node_modules/'))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @purpose Every changed file under root, preserving a proven no-HEAD state and every git error.
 * @param root Repository root passed to git as one argv value.
 * @returns Changed paths or the exact no-head/error state.
 */
export function getChangedFiles(root: string): ChangedFilesResult {
  const head = headState(root);
  if (head.status === 'error') return head;

  const untracked = git(root, 'list untracked files', [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  if (!untracked.ok) return { status: 'error', ...untracked };
  const untrackedFiles = nulPaths(untracked.stdout);
  if (head.status === 'no-head') {
    // An unborn branch has no deletion baseline. Its complete observable change set is therefore
    // every cached/index entry (including intent-to-add and an indexed addition deleted only from
    // the worktree) plus every untracked path. A path removed from both index and worktree is not a
    // staged deletion here: without a parent tree, Git has no prior path to delete.
    const indexed = git(root, 'list files in unborn index', ['ls-files', '--cached', '-z']);
    if (!indexed.ok) return { status: 'error', ...indexed };
    return {
      status: 'no-head',
      files: changedPathUnion(nulPaths(indexed.stdout), untrackedFiles),
    };
  }

  const diff = git(root, 'list files changed from HEAD', [
    'diff',
    '--name-only',
    '-z',
    'HEAD',
    '--',
  ]);
  if (!diff.ok) return { status: 'error', ...diff };
  return {
    status: 'ok',
    // `git diff HEAD` includes cached/unstaged modifications and deletions against the parent tree.
    files: changedPathUnion(nulPaths(diff.stdout), untrackedFiles),
  };
}

/**
 * @purpose Changed production source files, retaining the parent scan's typed git state.
 * @param root Repository root passed to getChangedFiles.
 * @returns The typed parent result with its file list source-filtered.
 */
export function getChangedSourceFiles(root: string): ChangedFilesResult {
  const result = getChangedFiles(root);
  if (result.status === 'error') return result;
  return {
    ...result,
    files: result.files.filter(
      (path) =>
        /\.(ts|tsx|js)$/.test(path) &&
        !/\.(test|spec)\.[jt]sx?$/.test(path) &&
        !path.includes('node_modules/')
    ),
  };
}

/**
 * @purpose Strictly read one path's HEAD bytes without confusing absence with git failure.
 * @param root Repository root.
 * @param relPath Exact repository-relative path.
 * @returns Content, proven absence/no-head, or the git failure.
 */
export function readHeadContent(
  root: string,
  relPath: string
):
  | { status: 'ok'; content: string }
  | { status: 'missing' | 'no-head' }
  | ({ status: 'error' } & GitCommandError) {
  const head = headState(root);
  if (head.status === 'error') return head;
  if (head.status === 'no-head') return { status: 'no-head' };

  const listed = git(root, 'locate path in HEAD', [
    'ls-tree',
    '-z',
    '--name-only',
    'HEAD',
    '--',
    relPath,
  ]);
  if (!listed.ok) return { status: 'error', ...listed };
  if (!nulPaths(listed.stdout).includes(relPath)) return { status: 'missing' };

  const shown = git(root, 'read path from HEAD', ['show', `HEAD:${relPath}`]);
  if (!shown.ok) return { status: 'error', ...shown };
  return { status: 'ok', content: shown.stdout };
}

/**
 * @purpose Compatibility reader for yagni while that command owns its own changed-file diagnostics.
 * @param root Repository root.
 * @param relPath Exact repository-relative path.
 * @returns HEAD content when proven; null for absent/no-HEAD/error (strict SDD consumers use readHeadContent).
 */
export function getHeadContent(root: string, relPath: string): string | null {
  const result = readHeadContent(root, relPath);
  return result.status === 'ok' ? result.content : null;
}

/**
 * @purpose Compatibility boolean for callers/tests that do not make a safety decision from failure.
 * @param root Repository root.
 * @returns True only for a proven HEAD commit.
 */
export function hasGitHead(root: string): boolean {
  return headState(root).status === 'ok';
}
