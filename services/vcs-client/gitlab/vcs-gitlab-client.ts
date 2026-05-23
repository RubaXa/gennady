// @file: GitLab REST API client — HTTP adapter implementing VcsClient contract.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-29

import { VcsGitlabMergeRequests } from './vcs-gitlab-merge-requests.ts';
import { VcsGitlabMergeDiscussions } from './vcs-gitlab-merge-discussions.ts';
import { VcsGitlabRepositoryFiles } from './vcs-gitlab-repository-files.ts';
import { VcsClient } from '../abstract/vcs-client.ts';

/**
 * @purpose Options for creating a GitLab API client: base URL and access token.
 * @consumer VcsGitlabClient
 */
export type VcsGitlabClientOptions = {
  /** @purpose GitLab instance base URL (e.g. https://gitlab.example.com) */
  baseUrl: string;
  /** @purpose GitLab personal or project access token */
  token: string;
};

/**
 * @purpose GitLab client for working with REST API.
 * @invariant Error Policy: Any non-2xx response is converted to an Error with status details.
 * @invariant Retry Policy: No retries; retry responsibility lies with the caller.
 * @consumer cli/review-verify
 */
export class VcsGitlabClient extends VcsClient {
  /** @see {VcsClient#MergeRequests} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeRequests: VcsGitlabMergeRequests;

  /** @see {VcsClient#MergeDiscussions} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeDiscussions: VcsGitlabMergeDiscussions;

  /** @see {VcsClient#RepositoryFiles} in services/vcs-client/abstract/vcs-client.ts */
  readonly RepositoryFiles: VcsGitlabRepositoryFiles;

  /**
   * @purpose Create a GitLab API client bound to a base URL with access token.
   * @param options Connection parameters: base URL and access token.
   */
  constructor(options: VcsGitlabClientOptions) {
    super();

    const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const response = await fetch(`${options.baseUrl}${path}`, {
        ...init,
        headers: {
          'PRIVATE-TOKEN': options.token,
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitLab request failed: ${response.status} ${response.statusText} ${text}`);
      }
      return response.json();
    };

    this.MergeRequests = new VcsGitlabMergeRequests(request);
    this.MergeDiscussions = new VcsGitlabMergeDiscussions(request);
    this.RepositoryFiles = new VcsGitlabRepositoryFiles(options.baseUrl, options.token);
  }
}
