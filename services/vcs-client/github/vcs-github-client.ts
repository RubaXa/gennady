// @file: GitHub REST API client — HTTP adapter implementing VcsClient contract (minimal, no MergeDiscussions).
// @spec: VCS-VCS-CLIENT
// @consumers: cli/cat

import { VcsGithubMergeRequests } from './vcs-github-merge-requests.ts';
import { VcsGithubMergeDiscussions } from './vcs-github-merge-discussions.ts';
import { VcsGithubRepositoryFiles } from './vcs-github-repository-files.ts';
import { VcsGithubReactions } from './vcs-github-reactions.ts';
import { VcsClient } from '../abstract/vcs-client.ts';
import { VcsGithubPipeline } from './vcs-github-pipeline.ts';

/**
 * @purpose Options for creating a GitHub API client: base URL and access token.
 * @consumer VcsGithubClient
 */
export type VcsGithubClientOptions = {
  /** @purpose GitHub API base URL (e.g. https://api.github.com) */
  baseUrl: string;
  /** @purpose GitHub personal access token */
  token: string;
};

/**
 * @purpose GitHub client for working with REST API (minimal: without MergeDiscussions).
 * @invariant Error Policy: Any non-2xx response is converted to an Error with status details.
 * @consumer cli/cat
 */
export class VcsGithubClient extends VcsClient {
  /** @see {VcsClient#MergeRequests} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeRequests: VcsGithubMergeRequests;

  /** @see {VcsClient#MergeDiscussions} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeDiscussions: VcsGithubMergeDiscussions;

  /** @see {VcsClient#RepositoryFiles} in services/vcs-client/abstract/vcs-client.ts */
  readonly RepositoryFiles: VcsGithubRepositoryFiles;

  /** @see {VcsClient#Inbox} in services/vcs-client/abstract/vcs-client.ts | @deferred GitLab-only */
  readonly Inbox = undefined;

  /** @see {VcsClient#Pipeline} in services/vcs-client/abstract/vcs-client.ts | @deferred GitLab-only */
  readonly Pipeline: VcsGithubPipeline;

  /** @see {VcsClient#Reactions} in services/vcs-client/abstract/vcs-client.ts */
  readonly Reactions: VcsGithubReactions;

  /**
   * @purpose Create a GitHub API client bound to a base URL with access token.
   * @param options Connection parameters: base URL and access token.
   */
  constructor(options: VcsGithubClientOptions) {
    super();

    const request = async (
      path: string,
      init: RequestInit & { responseType?: 'text' } = {}
    ): Promise<unknown> => {
      const { responseType, ...fetchInit } = init;
      const response = await fetch(`${options.baseUrl}${path}`, {
        ...fetchInit,
        headers: {
          Authorization: 'Bearer ' + options.token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(fetchInit.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${text}`);
      }
      return responseType === 'text' ? response.text() : response.json();
    };

    this.MergeRequests = new VcsGithubMergeRequests(request);
    this.MergeDiscussions = new VcsGithubMergeDiscussions(request);
    this.RepositoryFiles = new VcsGithubRepositoryFiles(options.baseUrl, options.token);
    this.Pipeline = new VcsGithubPipeline(request);
    this.Reactions = new VcsGithubReactions(request);
  }
}
