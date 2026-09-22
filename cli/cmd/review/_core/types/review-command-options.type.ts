// @file: Review pipeline launch options.
// @spec: CLI-REVIEW
// @consumers: run-review-command.logic

import type { ReviewCommandArgs } from './review-command-args.type.ts';
import type { ReviewCommandMode } from './review-command-mode.type.ts';
import type { VcsCliContext } from '../../../_shared/vcs-context-resolver.ts';

/**
 * @purpose Review pipeline launch options.
 * @consumer run-review-command.logic
 */
export type ReviewCommandOptions = {
  /** @purpose Review command mode (verify or issues). */
  mode: ReviewCommandMode;
  /** @purpose Normalized launch arguments for the review command. */
  args: ReviewCommandArgs;
  /** @purpose Pre-resolved VCS context — when set, skips git auto-detection. */
  vcsContext?: VcsCliContext;
};
