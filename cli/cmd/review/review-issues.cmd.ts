#!/usr/bin/env node
// @file: CLI command: review-issues
// @consumers: N/A
// @tasks: N/A, TSK-70

import { parseReviewCommandArgs } from './_core/logic/parse-review-command-args.logic.ts';
import { runReviewCommand } from './_core/logic/run-review-command.logic.ts';
import { resolveVcsContext } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs } from '../_shared/vcs-context-resolver.ts';

const reviewCommandArgs = parseReviewCommandArgs(process.argv);

const vcsCliArgs: VcsCliArgs = {
  ref: reviewCommandArgs.ref,
  branch: reviewCommandArgs.branch,
  project: reviewCommandArgs.project,
  iid: reviewCommandArgs.iid ? Number(reviewCommandArgs.iid) : undefined,
};

try {
  const vcsContext = await resolveVcsContext(vcsCliArgs);

  const run = await runReviewCommand({
    mode: 'issues',
    args: reviewCommandArgs,
    vcsContext,
  });

  if (run.output) {
    console.info(run.output);
  }

  process.exit(run.code);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✖ Ошибка: ${message}`);
  process.exit(1);
}
