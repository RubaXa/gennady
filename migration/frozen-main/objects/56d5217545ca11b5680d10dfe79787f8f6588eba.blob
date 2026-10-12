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

/** @purpose Entries excluded from sync: empty architecture dir, deprecated/domain-specific directives. @invariant Must be kept in sync with cli spec §3.4 exclusion list. */
export const EXCLUDED_ENTRIES = new Set([
  'architecture',
  'dbc-audit.directive.xml',
  'dev-review.directive.xml',
  'semantic-change-extractor.directive.xml',
]);

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
      collectRecursive(join(sourceDir, subdir), subdir, files);
    }
    return files.sort();
  }

  const files: string[] = [];
  collectRecursive(sourceDir, '', files);
  return files.sort();
}

function collectRecursive(dir: string, relativePrefix: string, result: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.') || EXCLUDED_ENTRIES.has(name)) continue;

    const fullPath = join(dir, name);
    const relativePath = relativePrefix ? join(relativePrefix, name) : name;
    const st = statSync(fullPath, { throwIfNoEntry: false });

    if (!st) continue;

    if (st.isDirectory()) {
      collectRecursive(fullPath, relativePath, result);
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

  const relativePaths = scanDirectives(opts.sourceDir, opts.subdirs);
  const entries: SyncFileEntry[] = [];

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

  return new SyncResult(entries);
}
