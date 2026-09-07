// @file: Shared YAGNI source-selection policy for changed-file discovery and corpus indexing.
// @consumers: YagniCommand, yagni-index
// @tasks: N/A

import { basename, extname } from 'node:path';
import { isTestFile, isUnderTestDirectory } from './files.ts';

/** @purpose Source extensions understood by the exact or approximate YAGNI symbol adapters. */
export const YAGNI_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rb',
  '.java',
]);

/**
 * @purpose Whether a repo-relative path is a source file supported by a YAGNI adapter.
 * @param path Repo-relative source candidate.
 * @returns True when its extension belongs to the closed supported set.
 */
export function isYagniSourceFile(path: string): boolean {
  return YAGNI_SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * @purpose Whether a source path belongs to language-conventional tests excluded from both YAGNI sides.
 * @param path Repo-relative supported-source path.
 * @returns True for shared JS/TS conventions or conventional Go/Python/Ruby/Java test names/dirs.
 */
export function isYagniTestTerritory(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const name = basename(normalized);
  return (
    isTestFile(normalized) ||
    isUnderTestDirectory(normalized) ||
    /(^|\/)(tests?|spec)(\/|$)/i.test(normalized) ||
    /_test\.go$/i.test(name) ||
    /^(test_.*|.*_test)\.py$/i.test(name) ||
    /_(spec|test)\.rb$/i.test(name) ||
    /Tests?\.java$/.test(name)
  );
}
