import type { GitRemoteInfo } from '../../../../../shared/backend/git/git-core.ts';

/**
 * @purpose Git-контекст для review-команд.
 * @consumer build-review-context-git.logic
 */
export type ReviewContextGit = {
  branch: string;
  remote: GitRemoteInfo;
};
