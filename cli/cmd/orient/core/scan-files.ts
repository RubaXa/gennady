// @file: Recursive .ts/.tsx file scanner with system dir exclusion and EACCES handling.
// @consumers: OrientCommand
// @tasks: TSK-55

import { lstatSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx'];
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'build',
  'out',
  '__tests__',
]);
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;

/**
 * @purpose Scan a directory recursively for .ts/.tsx files, excluding system dirs.
 * @invariant Excludes hidden dirs (starts with `.`), EXCLUDED_DIRS, symlinks.
 * @invariant EACCES errors are silently skipped — scan continues.
 * @param dir Absolute or relative directory path to scan.
 * @returns Sorted array of absolute file paths.
 */
export function scanFiles(dir: string): string[] {
  const fileSet = new Set<string>();
  const absDir = resolve(dir);
  walkDir(absDir, fileSet);
  return [...fileSet].sort();
}

function walkDir(dir: string, fileSet: Set<string>): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      walkDir(fullPath, fileSet);
    } else if (stat.isFile()) {
      if (TEST_FILE_PATTERN.test(entry.name)) continue;
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        fileSet.add(fullPath);
      }
    }
  }
}
