// @file: Git-контекст для review-команд.
// @consumers: build-review-context-git.logic, load-review-context-mr.logic, run-review-command.logic
// @tasks: N/A

import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Git-контекст для review-команд.
 * @consumer build-review-context-git.logic
 */
export type ReviewContextGit = {
  branch: string;
  remote: GitRemoteInfo;
};
