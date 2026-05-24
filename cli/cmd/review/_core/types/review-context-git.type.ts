// @file: Git context for review commands.
// @consumers: build-review-context-git.logic, load-review-context-mr.logic, run-review-command.logic
// @tasks: N/A

import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Git context for review commands.
 * @consumer build-review-context-git.logic
 */
export type ReviewContextGit = {
  /** @purpose Current branch name for the review. */
  branch: string;
  /** @purpose Remote repository info extracted from git config. */
  remote: GitRemoteInfo;
};
