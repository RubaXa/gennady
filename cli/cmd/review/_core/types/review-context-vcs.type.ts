// @file: VCS context for GitLab API requests.
// @spec: CLI-REVIEW
// @consumers: build-review-context-vcs.logic, load-review-context-mr.logic

import type { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';

/**
 * @purpose VCS context for GitLab API requests.
 * @consumer build-review-context-vcs.logic
 */
export type ReviewContextVcs = {
  /** @purpose GitLab host (e.g. "gitlab.example.com"). */
  host: string;
  /** @purpose GitLab project path (owner/repo). */
  project: string;
  /** @purpose Initialized VCS client for GitLab API requests. */
  vcs: VcsGitlabClient;
};
