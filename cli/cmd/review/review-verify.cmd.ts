#!/usr/bin/env node

import { parseReviewCommandArgs } from './_core/logic/parse-review-command-args.logic.ts';
import { runReviewCommand } from './_core/logic/run-review-command.logic.ts';

const reviewCommandArgs = parseReviewCommandArgs(process.argv);
const run = await runReviewCommand({
  mode: 'verify',
  args: reviewCommandArgs,
});

if (run.output) {
  console.info(run.output);
}

process.exit(run.code);
