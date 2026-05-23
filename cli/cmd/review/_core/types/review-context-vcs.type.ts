// @file: VCS context for GitLab API requests.
// @consumers: build-review-context-vcs.logic, load-review-context-mr.logic
// @tasks: N/A

import type { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';

/**
 * @purpose VCS context for GitLab API requests.
 * @consumer build-review-context-vcs.logic
 */
export type ReviewContextVcs = {
  host: string;
  project: string;
  vcs: VcsGitlabClient;
};
