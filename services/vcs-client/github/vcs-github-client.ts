// @file: GitHub REST API client — HTTP adapter implementing VcsClient contract (minimal, no MergeDiscussions).
// @consumers: cli/cat
// @tasks: TSK-30

import { VcsGithubMergeRequests } from './vcs-github-merge-requests.ts';
import { VcsGithubRepositoryFiles } from './vcs-github-repository-files.ts';
import { VcsClient } from '../abstract/vcs-client.ts';

/**
 * @purpose Опции для создания клиента GitHub API: базовый URL и токен доступа.
 * @consumer VcsGithubClient
 */
export type VcsGithubClientOptions = {
  /** @purpose GitHub API base URL (e.g. https://api.github.com) */
  baseUrl: string;
  /** @purpose GitHub personal access token */
  token: string;
};

/**
 * @purpose Клиент GitHub для работы с REST API (минимальный: без MergeDiscussions).
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @consumer cli/cat
 */
export class VcsGithubClient extends VcsClient {
  /** @see {VcsClient#MergeRequests} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeRequests: VcsGithubMergeRequests;

  /** @see {VcsClient#MergeDiscussions} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeDiscussions = undefined;

  /** @see {VcsClient#RepositoryFiles} in services/vcs-client/abstract/vcs-client.ts */
  readonly RepositoryFiles: VcsGithubRepositoryFiles;

  /**
   * @purpose Create a GitHub API client bound to a base URL with access token.
   * @param options Connection parameters: base URL and access token.
   */
  constructor(options: VcsGithubClientOptions) {
    super();

    const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const response = await fetch(`${options.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: 'Bearer ' + options.token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${text}`);
      }
      return response.json();
    };

    this.MergeRequests = new VcsGithubMergeRequests(request);
    this.RepositoryFiles = new VcsGithubRepositoryFiles(options.baseUrl, options.token);
  }
}
