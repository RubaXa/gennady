// @file: Narrow a golang verify run to the packages actually under change, instead of the whole repo.
// @consumers: golang-plugin, golang-plan.logic
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import type { ScopeRequest } from 'gennady/stack';
import { execFileTrimSafe } from 'gennady/stack';
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
  // Fallback prefers main: repos that carry both branches migrated master→main, so a
  // leftover origin/master is the stale one (review B9 follow-up).
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (gitOrEmpty(['rev-parse', '--verify', '--quiet', ref], root).length > 0) {
      return ref;
    }
  }
  return 'HEAD';
}

/**
 * @purpose Every path changed against the base ref, staged or untracked, as repo-relative strings.
 * @param root Absolute repository root.
 * @param baseRef Ref the comparison is made against.
 * @returns Repo-relative paths, deduplicated.
 * @sideEffect Process: three `git` invocations in the repository root.
 */
function collectChangedPaths(root: string, baseRef: string): string[] {
  const merge = gitOrEmpty(['merge-base', baseRef, 'HEAD'], root);
  const diffBase = merge.length > 0 ? merge : baseRef;

  // --relative: git prints paths relative to the git TOPLEVEL by default; with --root
  // pointing at a subdirectory that resolves to <root>/<root>/… and empties the scope.
  const lines = [
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', diffBase], root),
    gitOrEmpty(['diff', '--name-only', '--relative', '--diff-filter=ACMR', '--cached'], root),
    gitOrEmpty(['ls-files', '--others', '--exclude-standard'], root),
  ].join('\n');

  return [
    ...new Set(
      lines
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    ),
  ];
}

/**
 * @purpose Keep the Go source files out of a changed-path list, as absolute existing paths.
 * @param root Absolute repository root.
 * @param changed Repo-relative changed paths.
 * @returns Sorted absolute paths of Go files that exist on disk.
 */
function goFilesOf(root: string, changed: readonly string[]): string[] {
  const files = new Set<string>();
  for (const relativePath of changed) {
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
 * Files whose change invalidates package-level narrowing: the module graph or the linter's own
 * rules moved, so packages that did not change can still break (review #3).
 */
const WIDENING_RE =
  /^(?:go\.mod|go\.sum|go\.work|go\.work\.sum|\.golangci\.(?:yml|yaml|toml|json)|vendor\/)/;

/**
 * @purpose Build the shared module-resolution flags so vendored repos never reach the network.
 * @param project Detected project.
 * @returns `-mod=vendor` when the repo vendors its dependencies, otherwise no flags.
 */
export function moduleFlags(project: GoProject): string[] {
  // A go.work file takes precedence over vendoring and rejects -mod=vendor outright.
  if (project.workspace !== null) {
    return [];
  }
  return project.vendored ? ['-mod=vendor'] : [];
}

/**
 * @purpose Render dropped patterns for the scope note — a silent drop reads as full coverage.
 * @param dropped Patterns the toolchain refused.
 * @returns Note suffix, empty when nothing was dropped.
 */
function describeDropped(dropped: readonly string[]): string {
  return dropped.length === 0
    ? ''
    : `; ${dropped.length} unbuildable dropped (${dropped.join(', ')})`;
}

/**
 * @purpose Drop package patterns the Go toolchain cannot build, so the plan carries no false reds.
 * @invariant Fails open: dropped only when `go list` named a problem for that pattern; an
 *   unusable listing keeps every pattern.
 * @param project Detected project, supplying the toolchain and module flags.
 * @param patterns `./pkg` patterns derived from changed files.
 * @returns Buildable patterns plus the ones dropped, for the scope note.
 * @sideEffect Process: one `go list -e` in the repository root.
 */
/**
 * `go list -e` errors that mean "this directory is not a package we can build" — as opposed to
 * "the code in it is broken". Measured against go1.26; an error outside this list keeps the
 * package, so an unfamiliar message can only cost a false red, never a false green.
 */
const STRUCTURAL_LIST_ERRORS: readonly RegExp[] = [
  /build constraints exclude all Go files/,
  /^no Go files in /,
  /does not contain package/,
  /: directory not found$/,
];

/**
 * @purpose Tell a directory that is not a package from a package whose code is broken.
 * @invariant Only the listed structural classes are droppable. Compile errors — import cycles,
 *   conflicting package clauses — must reach the gates (spec §4).
 * @param error `go list -e` error text for one pattern.
 * @returns True when the pattern is not a buildable package at all.
 */
export function isStructuralListError(error: string): boolean {
  return STRUCTURAL_LIST_ERRORS.some((pattern) => pattern.test(error));
}

/**
 * @purpose Canonicalize a path so a symlinked prefix cannot defeat comparison.
 * @invariant `go list` prints `/tmp/x` where the plan holds `/private/tmp/x` on macOS; comparing
 *   raw strings there silently mismatches every package.
 * @param target Absolute path, existing or not.
 * @returns The resolved path, or the input when it cannot be resolved.
 */
function canonical(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

/**
 * @purpose Drop patterns that are not packages, keeping every package the gates must judge.
 * @invariant Fails open twice over: an unusable listing keeps every pattern, and a package whose
 *   error is not structural is kept so `build` reports it.
 * @param project Detected project, supplying the toolchain and module flags.
 * @param patterns `./pkg` patterns derived from changed files.
 * @returns Buildable patterns plus the ones dropped, for the scope note.
 * @sideEffect Process: one `go list -e` in the repository root.
 */
function dropUnbuildable(
  project: GoProject,
  patterns: readonly string[]
): { readonly packages: string[]; readonly dropped: string[] } {
  const go = project.tools.go.bin;
  if (go === null || patterns.length === 0) {
    return { packages: [...patterns], dropped: [] };
  }

  const listed = execFileTrimSafe(
    go,
    [
      'list',
      '-e',
      '-f',
      '{{.ImportPath}}\t{{.Dir}}\t{{if .Error}}{{.Error.Err}}{{end}}',
      ...moduleFlags(project),
      ...patterns,
    ],
    project.root
  );
  if (listed.length === 0) {
    return { packages: [...patterns], dropped: [] };
  }

  //#region START_CLASSIFY — invariant: a pattern is dropped only on a structural error
  // A nested module or a missing directory keeps the pattern itself as ImportPath and reports no
  // Dir, while a real package resolves both — so both keys are needed to find a pattern's line.
  const structuralByDir = new Set<string>();
  const structuralByPath = new Set<string>();
  for (const line of listed.split('\n')) {
    const [importPath, dir, ...rest] = line.split('\t');
    const error = rest.join('\t');
    if (error.length === 0 || !isStructuralListError(error)) {
      continue;
    }
    if (dir !== undefined && dir.length > 0) {
      structuralByDir.add(canonical(path.resolve(dir)));
    }
    if (importPath !== undefined && importPath.length > 0) {
      structuralByPath.add(importPath);
    }
  }
  //#endregion END_CLASSIFY

  const packages: string[] = [];
  const dropped: string[] = [];
  for (const pattern of patterns) {
    const dir = canonical(path.resolve(project.root, pattern));
    const structural = structuralByDir.has(dir) || structuralByPath.has(pattern);
    (structural ? dropped : packages).push(pattern);
  }
  return { packages, dropped };
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
 * @purpose Go-bearing paths for `gofmt`, with `vendor`/`testdata`/`node_modules` pruned at any depth.
 * @invariant A directory is handed over whole only when nothing excluded lives below it;
 *   otherwise the walk descends.
 * @param root Absolute repository root.
 * @returns Repo-relative files and directories, sorted.
 */
function goBearingTopLevelPaths(root: string): string[] {
  const targets: string[] = [];

  const walk = (dir: string, relative: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // "Handed over whole only when nothing excluded lives below it" — at ANY depth, not just
    // direct children: a `testdata`/`vendor` nested two levels down was swallowed by the whole
    // subtree and fed to `gofmt`, which (unlike `go ./...`) does not skip it (review P2).
    if (relative.length > 0 && !hasExcludedSegmentBelow(dir) && hasGoFile(dir)) {
      // Nothing excluded below this point, so the whole subtree can be handed to gofmt at once.
      targets.push(relative);
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || EXCLUDED_SEGMENTS.has(entry.name)) {
        continue;
      }
      const childRelative = relative.length > 0 ? path.join(relative, entry.name) : entry.name;
      if (entry.isFile() && entry.name.endsWith('.go')) {
        targets.push(childRelative);
      } else if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        hasGoFile(path.join(dir, entry.name))
      ) {
        walk(path.join(dir, entry.name), childRelative);
      }
    }
  };

  walk(root, '');
  return targets.sort();
}

/**
 * @purpose Probe: does an excluded segment (`vendor`/`testdata`/`node_modules`) live anywhere
 *   below `dir`? Guards handing a whole subtree to `gofmt`, which recurses into `testdata`.
 * @param dir Absolute directory to probe.
 * @returns True on the first excluded segment found below `dir`.
 */
function hasExcludedSegmentBelow(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) {
      continue;
    }
    if (EXCLUDED_SEGMENTS.has(entry.name)) {
      return true;
    }
    if (hasExcludedSegmentBelow(path.join(dir, entry.name))) {
      return true;
    }
  }
  return false;
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
    const filtered = dropUnbuildable(project, filesToPackages(root, files));
    return {
      mode: 'files',
      packages: filtered.packages,
      files,
      fmtTargets: toRelative(root, files),
      note: `${files.length} file(s) from ${request.targets.length} target(s)${describeDropped(filtered.dropped)}`,
    };
  }

  const baseRef = detectBaseRef(root);
  const changed = collectChangedPaths(root, baseRef);
  const files = goFilesOf(root, changed);

  const widening = changed.filter((entry) => WIDENING_RE.test(entry));
  if (widening.length > 0) {
    // Narrowing to touched packages is only sound while the module graph and lint rules hold
    // still. When they move, an untouched package is exactly what breaks.
    return {
      mode: 'changed',
      packages: ['./...'],
      files,
      fmtTargets: goBearingTopLevelPaths(root),
      note: `widened to ./... — ${widening.join(', ')} changed`,
    };
  }

  const filtered = dropUnbuildable(project, filesToPackages(root, files));
  return {
    mode: 'changed',
    packages: filtered.packages,
    files,
    fmtTargets: toRelative(root, files),
    note: `${files.length} Go file(s) changed vs ${baseRef}${describeDropped(filtered.dropped)}`,
  };
}
