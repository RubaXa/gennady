// @file: Shared source-selection policy for Gennady contract lint observation and repair.
// @spec: SHARED
// @consumers: LintCommand, Node target Verify adapter

import { extname } from 'node:path';
import { matchesAnyGlob } from './glob-match.ts';

const EXTENSIONS = new Set(['.ts', '.tsx']);
const SYSTEM_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', 'build', 'out']);
const SYSTEM_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/build/**',
  '**/out/**',
] as const;
const TEST_EXCLUDES = ['**/__tests__/**'] as const;
const NON_CONTRACT_EXCLUDES = [
  '**/fixtures/**',
  '**/__fixtures__/**',
  '**/*.fixture.*',
  '**/*.mock.*',
  '**/*.config.*',
] as const;

/**
 * @purpose Materialize the one source-selection policy shared by lint observation and Verify repair.
 * @param options Test/data inclusion switches plus project-authored exclusion globs.
 * @returns Deterministic excludes and predicates over normalized repository paths and directory names.
 */
export function gennadyLintSourcePolicy(options: {
  readonly includeAll?: boolean;
  readonly includeTests?: boolean;
  readonly exclude?: readonly string[];
}): {
  readonly excludePatterns: readonly string[];
  readonly includes: (filePath: string) => boolean;
  readonly traversesDirectory: (name: string) => boolean;
} {
  const includeAll = options.includeAll === true;
  const includeTests = includeAll || options.includeTests === true;
  const excludePatterns = [
    ...SYSTEM_EXCLUDES,
    ...(includeAll ? [] : [...(includeTests ? [] : TEST_EXCLUDES), ...NON_CONTRACT_EXCLUDES]),
    ...(options.exclude ?? []),
  ];
  return {
    excludePatterns,
    includes(filePath: string): boolean {
      return isGennadyLintTarget(filePath) && !matchesAnyGlob(filePath, excludePatterns);
    },
    traversesDirectory(name: string): boolean {
      return !SYSTEM_DIRECTORIES.has(name) && (includeTests || name !== '__tests__');
    },
  } as const;
}

/**
 * @purpose Decide whether the contract lint pipeline implements one source extension.
 * @param filePath Candidate source path.
 * @returns Whether the extension is supported.
 */
export function isGennadyLintTarget(filePath: string): boolean {
  return EXTENSIONS.has(extname(filePath).toLowerCase());
}
