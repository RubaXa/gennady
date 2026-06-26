// @file: Normalize review command CLI arguments into a single contract.
// @consumers: review-issues.cmd, review-verify.cmd
// @tasks: N/A

import { parseArgs } from '../../../../../shared/common/parse-args.ts';
import type { ReviewCommandArgs } from '../types/review-command-args.type.ts';

/**
 * @purpose Normalize review command CLI arguments into a single contract.
 * @param argv process.argv array.
 * @returns ReviewCommandArgs.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export function parseReviewCommandArgs(argv: string[]): ReviewCommandArgs {
  const args = parseArgs(argv, {
    branch: ['branch', 'b'],
    url: ['url'],
    ref: ['ref'],
    project: ['project'],
    iid: ['iid'],
    all: ['all'],
    since: ['since'],
    draft: ['draft'],
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
    all: args.all as boolean | undefined,
    since: args.since as string | undefined,
    draft: args.draft as boolean | undefined,
  };
}
