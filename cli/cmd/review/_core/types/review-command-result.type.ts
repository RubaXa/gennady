// @file: Review command execution result.
// @spec: CLI-REVIEW
// @consumers: run-review-command.logic

import type { ReviewArtifact } from './review-artifact.type.ts';

/**
 * @purpose Review command execution result.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export type ReviewCommandResult = {
  /** @purpose Whether the command completed successfully. */
  ok: boolean;
  /** @purpose Process exit code (0 = success). */
  code: number;
  /** @purpose Optional text output produced by the command. */
  output?: string;
  /** @purpose Optional structured artifact from the review pipeline. */
  artifact?: ReviewArtifact;
};
