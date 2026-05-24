// @file: Review pipeline launch options.
// @consumers: run-review-command.logic
// @tasks: N/A

import type { ReviewCommandArgs } from './review-command-args.type.ts';
import type { ReviewCommandMode } from './review-command-mode.type.ts';

/**
 * @purpose Review pipeline launch options.
 * @consumer run-review-command.logic
 */
export type ReviewCommandOptions = {
  /** @purpose Review command mode (verify or issues). */
  mode: ReviewCommandMode;
  /** @purpose Normalized launch arguments for the review command. */
  args: ReviewCommandArgs;
};
