// @file: Shared sync core — resolvePackageDir, compareBytes
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @purpose Detect the gennady self-repo (package.json name "gennady") and resolve subdir locally, bypassing node_modules.
 * @param projectRoot Candidate project root directory.
 * @param subdir Subdirectory path relative to the repo root (e.g., 'ai/skills').
 * @returns Absolute path or null when projectRoot is not the gennady repo or subdir is absent.
 */
function resolveSelfRepoDir(projectRoot: string, subdir: string): string | null {
  try {
    const pkgJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(pkgJsonPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { name?: string };
    if (pkg.name !== 'gennady') return null;

    const dirPath = join(projectRoot, subdir);
    return existsSync(dirPath) ? dirPath : null;
  } catch {
    // unreadable/invalid package.json — not the self-repo
    return null;
  }
}

/**
 * @purpose Locate a subdirectory inside the installed gennady npm package, or the gennady repo itself.
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

  // gennady's own repo (dev/CI running against itself) has no node_modules/gennady to find
  const selfRepoDir = resolveSelfRepoDir(projectRoot, subdir);
  if (selfRepoDir) return selfRepoDir;

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
