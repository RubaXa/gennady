import { parseArgs } from '../../../../../shared/common/parse-args.ts';
import type { ResolveConflictsCommandArgs } from '../types/resolve-conflicts-command-args.type.ts';

/**
 * @purpose Нормализовать CLI-аргументы resolve-conflicts в единый контракт.
 * @consumer resolve-conflicts.cmd
 * @param argv Массив process.argv.
 * @returns ResolveConflictsCommandArgs.
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
