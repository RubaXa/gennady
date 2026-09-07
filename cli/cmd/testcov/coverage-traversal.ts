// @file: Shared fail-closed directory traversal primitive for scoped and project-wide coverage.
// @consumers: istanbul-coverage-adapter.ts, testcov.cmd.ts

import { readdirSync, type Dirent } from 'node:fs';

/** @purpose Typed evidence that a coverage source walk is incomplete and must not be aggregated. */
export class CoverageTraversalError extends Error {
  /** Stable CLI diagnostic identity. */
  readonly code = 'ERR_CLI_TESTCOV_TRAVERSAL';
}

/**
 * @purpose Enumerate one directory or fail rather than returning a partial coverage corpus.
 * @param directory Exact directory being traversed.
 * @returns Complete directory entries.
 */
export function readCoverageDirectory(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code ?? 'I/O error';
    throw new CoverageTraversalError(`cannot enumerate ${directory}: ${code}`);
  }
}
