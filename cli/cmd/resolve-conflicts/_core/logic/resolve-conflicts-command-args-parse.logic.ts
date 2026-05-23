// @file: Normalize resolve-conflicts CLI arguments into a single contract.
// @consumers: resolve-conflicts.cmd
// @tasks: N/A

import { parseArgs } from '../../../../../shared/common/parse-args.ts';
import type { ResolveConflictsCommandArgs } from '../types/resolve-conflicts-command-args.type.ts';

/**
 * @purpose Normalize resolve-conflicts CLI arguments into a single contract.
 * @param argv process.argv array.
 * @returns ResolveConflictsCommandArgs.
 * @consumer resolve-conflicts.cmd
 */
export function parseResolveConflictsCommandArgs(argv: string[]): ResolveConflictsCommandArgs {
  const args = parseArgs(argv, {
    branch: ['branch', 'b'],
    incoming: ['incoming'],
  });

  return {
    branch: args.branch as string | undefined,
    incoming: args.incoming as string | undefined,
  };
}
