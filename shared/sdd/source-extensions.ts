// @file: One closed cross-language source-extension and evidence policy for SDD consumers.
// @spec: SHARED
// @consumers: sdd-check, changed-files, yagni source policy, SymbolIndex selector

import { basename, extname } from 'node:path';

/** @purpose Evidence precision available for one supported source language. */
type SourceEvidenceLevel = 'exact' | 'approximate';

/** @purpose Closed extension registry shared by ownership, consumers, BDD indexing, and YAGNI. */
export const SDD_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
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
  '.swift',
  '.m',
  '.mm',
  '.h',
  '.hh',
  '.hpp',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.kt',
  '.kts',
]);

/**
 * @purpose Decide whether a path belongs to the shared supported source corpus.
 * @param path Repository-relative or absolute source candidate.
 * @returns True exactly for extensions in `SDD_SOURCE_EXTENSIONS`.
 */
export function isSddSourceFile(path: string): boolean {
  return SDD_SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * @purpose Name the proof precision available to language-aware consumers.
 * @param path Supported or unsupported source path.
 * @returns Exact for installed TypeScript grammars, approximate for other supported languages,
 *   and null outside the closed registry.
 */
export function sourceEvidenceLevel(path: string): SourceEvidenceLevel | null {
  const extension = extname(path).toLowerCase();
  if (!SDD_SOURCE_EXTENSIONS.has(extension)) return null;
  return extension === '.ts' || extension === '.tsx' ? 'exact' : 'approximate';
}

/**
 * @purpose Recognize language-conventional test files inside the shared source corpus.
 * @param path Repository-relative or absolute source path.
 * @returns True for supported JS/TS, Swift, Go, Python, Ruby, Java, and Kotlin test naming.
 */
export function isSddTestFile(path: string): boolean {
  if (!isSddSourceFile(path)) return false;
  const normalized = path.replaceAll('\\', '/');
  const name = basename(normalized);
  return (
    /\.(?:test|spec)\.[^.]+$/i.test(name) ||
    /Tests?\.swift$/.test(name) ||
    /_test\.go$/i.test(name) ||
    /^(?:test_.*|.*_test)\.py$/i.test(name) ||
    /_(?:spec|test)\.rb$/i.test(name) ||
    /Tests?\.java$/.test(name) ||
    /Tests?\.kts?$/.test(name) ||
    /(^|\/)(?:tests?|__tests__|spec)(\/|$)/i.test(normalized)
  );
}
