import type { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';

/**
 * @purpose VCS-контекст для запросов к GitLab API.
 * @consumer build-review-context-vcs.logic
 */
export type ReviewContextVcs = {
  host: string;
  project: string;
  vcs: VcsGitlabClient;
};
