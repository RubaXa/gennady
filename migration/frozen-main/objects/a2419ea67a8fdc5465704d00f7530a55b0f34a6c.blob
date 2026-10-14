// @file: Shared sync core — resolvePackageDir, compareBytes
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const resolved = import.meta.resolve('gennady');
    const pkgFile = fileURLToPath(resolved);
    const pkgRoot = pkgFile.replace(/[/\\]dist[/\\].*$/, '');
    const dirPath = join(pkgRoot, subdir);
    if (existsSync(dirPath)) return dirPath;
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
