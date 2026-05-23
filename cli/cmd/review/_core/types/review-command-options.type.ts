// @file: Опции запуска review pipeline.
// @consumers: run-review-command.logic
// @tasks: N/A

import type { ReviewCommandArgs } from './review-command-args.type.ts';
import type { ReviewCommandMode } from './review-command-mode.type.ts';

/**
 * @purpose Опции запуска review pipeline.
 * @consumer run-review-command.logic
 */
export type ReviewCommandOptions = {
  mode: ReviewCommandMode;
  args: ReviewCommandArgs;
};
