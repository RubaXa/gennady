// @file: Narrow a golang verify run to the packages actually under change, instead of the whole repo.
// @consumers: golang-plugin, golang-plan.logic
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { execFileTrimSafe } from '../../../../shared/common/exec.ts';
import type { ScopeRequest } from '../../stack.types.ts';
import type { GoProject } from './golang-detect.logic.ts';

/** Path segments whose packages are never worth verifying directly. */
const EXCLUDED_SEGMENTS = new Set(['vendor', 'testdata', 'node_modules']);

/**
 * @purpose The set of packages and files a golang run applies to.
 * @consumer golang-plan.logic, golang-plugin
 */
export type GoScope = {
  /** @purpose Scoping strategy that was applied. */
  readonly mode: ScopeRequest['mode'];
  /** @purpose Package patterns in `go` CLI form, e.g. `./internal/foo`. Empty means nothing to check. */
  readonly packages: readonly string[];
  /** @purpose Absolute paths of `.go` files in scope. Empty in `all` mode. */
  readonly files: readonly string[];
  /** @purpose Root-relative paths handed to the formatting gate (dirs in `all` mode, files otherwise). */
  readonly fmtTargets: readonly string[];
  /** @purpose Human-readable note explaining how the scope was derived. */
  readonly note: string;
};

/**
 * @purpose Run a git command in a directory, returning empty output instead of throwing.
 * @param args Arguments passed to `git`, executed without a shell.
 * @param cwd Absolute working directory for the command.
 * @returns Trimmed stdout, or an empty string when git fails or is unavailable.
 */
function gitOrEmpty(args: readonly string[], cwd: string): string {
  return execFileTrimSafe('git', args, cwd);
}

/**
 * @purpose Test whether a repo-relative path lies inside an excluded directory.
 * @param relativePath Repo-relative path with POSIX or platform separators.
 * @returns True when any segment of the path is excluded.
 */
function isExcluded(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

/**
 * @purpose Pick the first branch ref that exists, so scoping works on both `main` and `master` repos.
 * @param root Absolute repository root.
 * @returns A usable base ref, defaulting to `HEAD` when no known base branch resolves.
 */
function detectBaseRef(root: string): string {
  // The remote HEAD is authoritative — a migrated repo may keep a stale origin/master.
  const remoteHead = gitOrEmpty(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], root);
  if (remoteHead.startsWith('refs/remotes/')) {
    return remoteHead.slice('refs/remotes/'.length);
  }
  for (const ref of ['origin/master', 'origin/main', 'master', 'main']) {
    if (gitOrEmpty(['rev-parse', '--verify', '--quiet', ref], root).length > 0) {
      return ref;
    }
  }
  return 'HEAD';
}

/**
 * @purpose List Go files changed against a base ref, including uncommitted and untracked work.
 * @param root Absolute repository root.
 * @param baseRef Ref to diff against.
 * @returns Absolute paths of changed `.go` files that still exist on disk.
 */
function collectChangedGoFiles(root: string, baseRef: string): string[] {
  const merge = gitOrEmpty(['merge-base', baseRef, 'HEAD'], root);
  const diffBase = merge.length > 0 ? merge : baseRef;

  // --relative: git prints paths relative to the git TOPLEVEL by default; with --root
  // pointing at a subdirectory that resolves to <root>/<root>/… and empties the scope.
  const lines = [
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', diffBase], root),
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', '--cached'], root),
    gitOrEmpty(['ls-files', '--others', '--exclude-standard'], root),
  ].join('\n');

  const files = new Set<string>();
  for (const line of lines.split('\n')) {
    const relativePath = line.trim();
    if (!relativePath.endsWith('.go') || isExcluded(relativePath)) {
      continue;
    }
    const absolute = path.resolve(root, relativePath);
    if (fs.existsSync(absolute)) {
      files.add(absolute);
    }
  }

  return [...files].sort();
}

/**
 * @purpose Convert Go source files into the deduplicated `./pkg` patterns their packages live in.
 * @param root Absolute repository root that patterns are relative to.
 * @param files Absolute paths of Go source files.
 * @returns Sorted `./`-prefixed package patterns, one per distinct directory.
 */
function filesToPackages(root: string, files: readonly string[]): string[] {
  const dirs = new Set<string>();

  for (const file of files) {
    const relativeDir = path.relative(root, path.dirname(file));
    if (relativeDir.startsWith('..')) {
      continue;
    }
    const posix = relativeDir.split(path.sep).join('/');
    dirs.add(posix.length === 0 ? '.' : `./${posix}`);
  }

  return [...dirs].sort();
}

/**
 * @purpose Expand explicit user targets into the Go files they cover, accepting files or directories.
 * @param root Absolute repository root.
 * @param targets User-supplied paths, absolute or relative to root.
 * @returns Absolute paths of the `.go` files the targets resolve to.
 */
function expandTargets(root: string, targets: readonly string[]): string[] {
  const files = new Set<string>();

  for (const target of targets) {
    const absolute = path.resolve(root, target);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolute);
    } catch {
      continue;
    }

    if (stat.isFile()) {
      if (absolute.endsWith('.go')) {
        files.add(absolute);
      }
      continue;
    }

    // #region START_DIR_WALK — invariant: directory targets contribute only their own non-excluded .go files
    const stack = [absolute];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDED_SEGMENTS.has(entry.name) && !entry.name.startsWith('.')) {
            stack.push(child);
          }
        } else if (entry.name.endsWith('.go')) {
          files.add(child);
        }
      }
    }
    // #endregion END_DIR_WALK
  }

  return [...files].sort();
}

/**
 * @purpose List the root-level paths that hold Go sources, so whole-repo formatting stays off vendor.
 * @param root Absolute repository root.
 * @returns Root-relative directory names plus any top-level `.go` files, sorted.
 */
function goBearingTopLevelPaths(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const targets: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || EXCLUDED_SEGMENTS.has(entry.name)) {
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.go')) {
      targets.push(entry.name);
      continue;
    }
    if (entry.isDirectory() && hasGoFile(path.join(root, entry.name))) {
      targets.push(entry.name);
    }
  }

  return targets.sort();
}

/**
 * @purpose Early-exit probe: does the directory tree contain any .go file?
 * @param dir Absolute directory to probe.
 * @returns True on the first .go file found; excluded segments are pruned.
 */
function hasGoFile(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.go')) {
      return true;
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !EXCLUDED_SEGMENTS.has(entry.name) && !entry.name.startsWith('.')) {
      if (hasGoFile(path.join(dir, entry.name))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @purpose Shorten absolute paths to root-relative form so plans and commands stay readable.
 * @param root Absolute repository root, which every gate uses as its cwd.
 * @param files Absolute file paths.
 * @returns Paths relative to root, preserving order.
 */
function toRelative(root: string, files: readonly string[]): string[] {
  return files.map((file) => path.relative(root, file) || file);
}

/**
 * @purpose Decide which packages and files a run covers, keeping monorepo runs bounded.
 * @param project Detected project, providing the root that patterns resolve against.
 * @param request Scoping request from the operator.
 * @returns Scope with package patterns, Go files, formatting targets and a derivation note.
 */
export function resolveGoScope(project: GoProject, request: ScopeRequest): GoScope {
  const { root } = project;

  if (request.mode === 'all') {
    return {
      mode: 'all',
      packages: ['./...'],
      files: [],
      fmtTargets: goBearingTopLevelPaths(root),
      note: 'whole repository (./...)',
    };
  }

  if (request.mode === 'files') {
    const files = expandTargets(root, request.targets);
    return {
      mode: 'files',
      packages: filesToPackages(root, files),
      files,
      fmtTargets: toRelative(root, files),
      note: `${files.length} file(s) from ${request.targets.length} target(s)`,
    };
  }

  const baseRef = detectBaseRef(root);
  const files = collectChangedGoFiles(root, baseRef);
  return {
    mode: 'changed',
    packages: filesToPackages(root, files),
    files,
    fmtTargets: toRelative(root, files),
    note: `${files.length} Go file(s) changed vs ${baseRef}`,
  };
}
