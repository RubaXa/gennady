// @file: GennadyLintSourcePolicy — one extension policy for lint target resolution and SDD audit evidence.
// @consumers: LintCommand, SddTaskCommand
// @tasks: N/A

import { extname } from 'node:path';

const GENNADY_LINT_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * @purpose Decide whether gennady lint can actually inspect one source path.
 * @param filePath Candidate file path from CLI resolution or SDD audit evidence.
 * @returns True only for extensions implemented by the current lint pipeline.
 */
export function isGennadyLintTarget(filePath: string): boolean {
  return GENNADY_LINT_EXTENSIONS.has(extname(filePath).toLowerCase());
}
