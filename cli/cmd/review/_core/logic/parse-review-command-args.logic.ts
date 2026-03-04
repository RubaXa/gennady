import { parseArgs } from '../../../../../shared/common/parse-args.ts';
import type { ReviewCommandArgs } from '../types/review-command-args.type.ts';

/**
 * @purpose Нормализовать CLI-аргументы review-команд в единый контракт.
 * @consumer review-verify.cmd, review-issues.cmd
 * @param argv Массив process.argv.
 * @returns ReviewCommandArgs.
 */
export function parseReviewCommandArgs(argv: string[]): ReviewCommandArgs {
  const args = parseArgs(argv, {
    branch: ['branch', 'b'],
    url: ['url'],
    ref: ['ref'],
    project: ['project'],
    iid: ['iid'],
  });

  const positional = args._.filter((entry) => typeof entry === 'string') as string[];
  const positionalUrl = positional.find((entry) => entry.startsWith('http'));
  const positionalRef = positional.find((entry) => entry.includes('!'));

  const explicitUrl = args.url as string | undefined;
  const explicitRef = args.ref as string | undefined;

  const derivedUrl = !explicitUrl ? positionalUrl : undefined;
  const derivedRef = !explicitRef ? positionalRef : undefined;

  return {
    branch: args.branch as string | undefined,
    url: explicitUrl ?? derivedUrl,
    ref: explicitRef ?? derivedRef,
    project: args.project as string | undefined,
    iid: args.iid as string | undefined,
  };
}
