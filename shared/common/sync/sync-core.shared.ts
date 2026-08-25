// @file: Shared sync core — resolvePackageDir, compareBytes
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @purpose Walk up from a resolved entry point to the directory owning its package.json.
 * @invariant Layout-agnostic: published installs resolve inside `dist/`, clones to a source
 *   file; stripping `dist` only worked for the first.
 * @param entryPath Absolute path of a file inside the package.
 * @returns The package root, or null when no package.json sits above it.
 */
function packageRootOf(entryPath: string): string | null {
  let dir = dirname(entryPath);
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      // Must be gennady itself: an unrelated parent manifest would point the sync at a tree
      // that has no ai/ at all, and the caller would report a confusing absence.
      try {
        const name = (JSON.parse(readFileSync(manifest, 'utf-8')) as { name?: string }).name;
        if (name === 'gennady') {
          return dir;
        }
      } catch {
        // Unreadable manifest — keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * @purpose Locate a subdirectory inside the installed gennady npm package.
 * @param projectRoot Project root directory (contains node_modules/).
 * @param subdir Subdirectory path inside the gennady package (e.g., 'ai/directives').
 * @returns Absolute path or null if the package or subdirectory is not found.
 */
export function resolvePackageDir(projectRoot: string, subdir: string): string | null {
  try {
    const localPath = join(projectRoot, 'node_modules', 'gennady', subdir);
    if (existsSync(localPath)) return localPath;
  } catch {
    // EACCES or other filesystem errors — fall through to import.meta.resolve
  }

  try {
    const pkgRoot = packageRootOf(fileURLToPath(import.meta.resolve('gennady')));
    if (pkgRoot !== null) {
      const dirPath = join(pkgRoot, subdir);
      if (existsSync(dirPath)) return dirPath;
    }
  } catch {
    // import.meta.resolve may fail
  }

  return null;
}

/**
 * @purpose Byte-level comparison of two buffers.
 * @param a First buffer.
 * @param b Second buffer.
 * @returns false when buffers are byte-identical, true otherwise. Degrades to true on non-Buffer inputs.
 */
export function compareBytes(a: Buffer | undefined | null, b: Buffer | undefined | null): boolean {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return true;
  return Buffer.compare(a, b) !== 0;
}
