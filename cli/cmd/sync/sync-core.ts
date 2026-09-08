// @file: Sync core — scanDirectives, collectAndCompare
// @consumers: sync.cmd.ts, sync-core.test.ts
// @tasks: TSK-53, TSK-54, TSK-56

import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { ERR_SYNC_SUBDIR_NOT_FOUND, ERR_SYNC_SOURCE_NOT_FOUND, SyncResult } from './sync.types.ts';
import type { SyncFileEntry, SyncOptions, SyncFileStatus } from './sync.types.ts';
import {
  resolvePackageDir as _resolvePackageDirShared,
  compareBytes,
} from '../../../shared/common/sync/sync-core.shared.ts';
import { normalize, SYNC_PATH_RULES } from '../../../shared/common/sync/path-normalizer.ts';

/** @purpose Entries excluded from sync: empty architecture dir. @invariant Must be kept in sync with cli spec §3.4 exclusion list. */
export const EXCLUDED_ENTRIES = new Set(['architecture']);

/** @purpose DI port for SyncCore — abstracts filesystem access for testability. @invariant All deps must be provided; no optional fields. */
export interface SyncCoreDeps {
  /**
   * @purpose Read file from disk.
   * @param path File path.
   * @returns File contents as Buffer.
   */
  readFile: (path: string) => Buffer;
  /**
   * @purpose Write file to disk.
   * @param path File path.
   * @param data File contents.
   */
  writeFile: (path: string, data: Buffer) => void;
  /**
   * @purpose Create directory.
   * @param path Directory path.
   * @param [opts] Options.
   */
  mkdir: (path: string, opts?: { recursive: boolean }) => void;
  /**
   * @purpose Get file stats.
   * @param path File path.
   * @returns Stats object.
   */
  stat: (path: string) => { isDirectory(): boolean; isFile(): boolean };
  /**
   * @purpose List directory contents.
   * @param path Directory path.
   * @returns File names.
   */
  readdir: (path: string) => string[];
  /**
   * @purpose Delete one stale target file during full mirror sync.
   * @param path Absolute stale target file path.
   */
  unlink?: (path: string) => void;
  /** @purpose Current working directory. */
  cwd: string;
}

/**
 * @purpose Locate ai/directives/ in the installed gennady package. Delegates to shared resolvePackageDir.
 * @param cwd Current working directory.
 * @param [subdir] Subdirectory inside gennady package (defaults to 'ai/directives').
 * @returns Absolute path to ai/directives/ or null if the package is not found.
 */
export function resolvePackageDir(cwd: string, subdir = 'ai/directives'): string | null {
  return _resolvePackageDirShared(cwd, subdir);
}

/**
 * @purpose Recursively collect a list of files in sourceDir with filter and exclusion support.
 * @param sourceDir Source directory to scan.
 * @param [subdirs] Optional list of subdirectories to scan.
 * @throws If subdir does not exist in sourceDir.
 * @returns List of relative file paths.
 */
export function scanDirectives(sourceDir: string, subdirs?: string[]): string[] {
  return scanDirectivesChecked(sourceDir, subdirs).paths;
}

/**
 * @purpose Like scanDirectives, but also reports which subtrees a read error cut short (SO-7):
 *   a source subtree gennady failed to read must never be mistaken for one the source lacks.
 * @param sourceDir Source directory to scan.
 * @param [subdirs] Optional list of subdirectories to scan.
 * @throws If subdir does not exist in sourceDir.
 * @returns Relative file paths, plus the relative prefixes whose contents were cut short.
 */
function scanDirectivesChecked(
  sourceDir: string,
  subdirs?: string[]
): { paths: string[]; incompletePrefixes: string[] } {
  const incompletePrefixes: string[] = [];

  if (subdirs && subdirs.length > 0) {
    const available = readdirSync(sourceDir).filter(
      (name) => !EXCLUDED_ENTRIES.has(name) && statSync(join(sourceDir, name)).isDirectory()
    );

    for (const subdir of subdirs) {
      if (!available.includes(subdir)) {
        const msg = `[scanDirectives] ai/directives/${subdir}/ not found in package.\nAvailable: ${available.join(', ')}`;
        const error = new Error(msg);
        (error as Error & { code: string }).code = ERR_SYNC_SUBDIR_NOT_FOUND;
        throw error;
      }
    }

    const files: string[] = [];
    for (const subdir of subdirs) {
      collectRecursive(join(sourceDir, subdir), subdir, files, incompletePrefixes);
    }
    return { paths: files.sort(), incompletePrefixes };
  }

  const files: string[] = [];
  collectRecursive(sourceDir, '', files, incompletePrefixes);
  return { paths: files.sort(), incompletePrefixes };
}

/**
 * @purpose Whether relativePath falls under a subtree a read error cut short (SO-7).
 * @param relativePath Candidate path, `/`-separated.
 * @param incompletePrefixes Prefixes `collectRecursive` could not fully read; `''` is the root.
 * @returns True when relativePath is inside (or equal to) one of the incomplete prefixes.
 */
function isUnderIncompletePrefix(
  relativePath: string,
  incompletePrefixes: readonly string[]
): boolean {
  return incompletePrefixes.some(
    (prefix) => prefix === '' || relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  );
}

/**
 * @purpose List top-level subdirectory names the package (source) owns, for scoping mirror deletion.
 * @param sourceDir Source directory to inspect.
 * @returns Directory names directly under sourceDir, excluding EXCLUDED_ENTRIES and non-directories.
 */
function listOwnedSubdirs(sourceDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(sourceDir);
  } catch {
    return [];
  }
  return entries.filter((name) => {
    if (EXCLUDED_ENTRIES.has(name)) return false;
    const st = statSync(join(sourceDir, name), { throwIfNoEntry: false });
    return st?.isDirectory() ?? false;
  });
}

/**
 * @purpose Scan the target for mirror-deletion candidates, never throwing on a missing directory —
 *   an absent target subdirectory simply has nothing to delete.
 * @invariant Scans only package-owned subdirs: a project-added custom subdirectory is left
 *   untouched and reported as a warning, never swept away.
 * @param targetDir Target directory to scan.
 * @param ownedSubdirs Top-level subdirectory names the package owns for this sync.
 * @param filtered True when an explicit subdir filter was passed — root files and out-of-filter
 *   directories are then out of scope, not warned about.
 * @returns Relative file paths eligible for mirror deletion, plus warnings for target
 *   subdirectories the package does not own.
 */
function scanTargetMirrorSpace(
  targetDir: string,
  ownedSubdirs: Set<string>,
  filtered: boolean
): { paths: string[]; warnings: string[] } {
  let topEntries: string[];
  try {
    topEntries = readdirSync(targetDir);
  } catch {
    return { paths: [], warnings: [] };
  }

  const files: string[] = [];
  const warnings: string[] = [];

  for (const name of topEntries) {
    if (name.startsWith('.') || EXCLUDED_ENTRIES.has(name)) continue;

    const fullPath = join(targetDir, name);
    const st = statSync(fullPath, { throwIfNoEntry: false });
    if (!st) continue;

    if (st.isDirectory()) {
      if (ownedSubdirs.has(name)) {
        collectRecursive(fullPath, name, files);
      } else if (!filtered) {
        warnings.push(
          `unknown subdirectory in target (not owned by package, left untouched): ${name}`
        );
      }
      // Filtered mode: a directory outside the requested filter is out of scope, not a warning.
    } else if (st.isFile() && !filtered) {
      // Root-level files are only mirror candidates when the whole package (not a subdir filter)
      // is being synced — matches scanDirectives(sourceDir, subdirs), which excludes root files
      // from relativePaths whenever a subdir filter is active.
      files.push(name);
    }
  }

  return { paths: files.sort(), warnings };
}

/**
 * @purpose Recursively list files under dir, `/`-separated relative to the original root.
 * @invariant SO-7: a `readdirSync` failure records `relativePrefix` in `incomplete` (when given)
 *   instead of silently returning as if the subtree were empty — the two are not the same thing
 *   to a caller deciding what to delete.
 * @param dir Directory to scan.
 * @param relativePrefix Path prefix relative to the scan root, `/`-separated.
 * @param result Accumulator for discovered file paths.
 * @param [incomplete] Accumulator for prefixes whose contents could not be fully read.
 */
function collectRecursive(
  dir: string,
  relativePrefix: string,
  result: string[],
  incomplete?: string[]
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    incomplete?.push(relativePrefix.split(sep).join('/'));
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.') || EXCLUDED_ENTRIES.has(name)) continue;

    const fullPath = join(dir, name);
    const relativePath = relativePrefix ? join(relativePrefix, name) : name;
    const st = statSync(fullPath, { throwIfNoEntry: false });

    if (!st) continue;

    if (st.isDirectory()) {
      collectRecursive(fullPath, relativePath, result, incomplete);
    } else if (st.isFile()) {
      result.push(relativePath.split(sep).join('/'));
    }
  }
}

/**
 * @purpose Main entry point: compare source and target, return SyncResult.
 * @param deps Injectable filesystem dependencies.
 * @param opts Sync options (package, target, dryRun, verbose).
 * @returns Sync result with file entries and summary counts.
 */
export function collectAndCompare(deps: SyncCoreDeps, opts: SyncOptions): SyncResult {
  try {
    deps.stat(opts.sourceDir);
  } catch {
    const msg = `[collectAndCompare] Source directory not found: ${opts.sourceDir}`;
    const error = new Error(msg);
    (error as Error & { code: string }).code = ERR_SYNC_SOURCE_NOT_FOUND;
    throw error;
  }

  const { paths: relativePaths, incompletePrefixes } = scanDirectivesChecked(
    opts.sourceDir,
    opts.subdirs
  );
  const entries: SyncFileEntry[] = [];
  const sourcePaths = new Set(relativePaths);

  // Sync is a package-owned mirror, not an additive copy. A removed directive must disappear from
  // the target too, otherwise an update can keep executing stale flow logic indefinitely. The
  // mirror is scoped to what the package owns in the SOURCE — an absent target subdirectory is
  // simply empty of stale files (not an error), and a target subdirectory the package never
  // shipped is a project customization, left untouched and reported via `warnings`.
  const filtered = Boolean(opts.subdirs && opts.subdirs.length > 0);
  const ownedSubdirs = new Set(filtered ? opts.subdirs! : listOwnedSubdirs(opts.sourceDir));
  const { paths: targetPaths, warnings } = scanTargetMirrorSpace(
    opts.targetDir,
    ownedSubdirs,
    filtered
  );

  // SO-7: a source subtree a read error cut short is NOT the same as a source subtree the
  // package genuinely stopped shipping — treating the two alike turned one `EACCES` into the
  // silent deletion of every target file underneath. Fail-safe: skip, warn, never guess.
  for (const prefix of incompletePrefixes) {
    warnings.push(`source could not be fully read, skipping deletion under: ${prefix || '(root)'}`);
  }

  for (const relativePath of targetPaths) {
    if (sourcePaths.has(relativePath)) continue;
    if (isUnderIncompletePrefix(relativePath, incompletePrefixes)) continue;
    entries.push({ relativePath, status: 'deleted' });
    if (!opts.dryRun) {
      if (!deps.unlink) {
        throw new Error(
          `[collectAndCompare] unlink dependency missing for stale file: ${relativePath}`
        );
      }
      deps.unlink(join(opts.targetDir, relativePath));
    }
  }

  for (const relativePath of relativePaths) {
    const sourcePath = join(opts.sourceDir, relativePath);
    const targetPath = join(opts.targetDir, relativePath);
    const sourceData = deps.readFile(sourcePath);
    const normalizedContent = normalize(sourceData.toString('utf-8'), SYNC_PATH_RULES);
    const normalizedData = Buffer.from(normalizedContent, 'utf-8');
    const sourceSize = normalizedData.length;

    let targetData: Buffer | null = null;
    try {
      targetData = deps.readFile(targetPath);
    } catch {
      // file doesn't exist in target
    }

    let status: SyncFileStatus;
    if (targetData === null) {
      status = 'added';
    } else if (!compareBytes(normalizedData, targetData)) {
      status = 'unchanged';
    } else {
      status = 'updated';
    }

    entries.push({
      relativePath,
      status,
      sourceSize,
      targetSize: targetData?.length,
    });

    if (!opts.dryRun && status !== 'unchanged') {
      deps.mkdir(join(opts.targetDir, relativePath, '..'), { recursive: true });
      deps.writeFile(targetPath, normalizedData);
    }
  }

  return new SyncResult(entries, warnings);
}
