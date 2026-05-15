import { VcsGitlabMergeRequests } from './vcs-gitlab-merge-requests.ts';
import { VcsGitlabMergeDiscussions } from './vcs-gitlab-merge-discussions.ts';
import { VcsClient } from '../abstract/vcs-client.ts';

/**
 * @purpose Опции для создания клиента GitLab API: базовый URL и токен доступа.
 * @consumer VcsGitlabClient
 */
export type VcsGitlabClientOptions = {
  baseUrl: string;
  token: string;
};

/**
 * @purpose Клиент GitLab для работы с REST API.
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @invariant Retry Policy: Повторов нет; ответственность за ретраи на вызывающей стороне.
 * @consumer cli/review-verify
 */
export class VcsGitlabClient extends VcsClient {
  /** @see {VcsClient#MergeRequests} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeRequests: VcsGitlabMergeRequests;

  /** @see {VcsClient#MergeDiscussions} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeDiscussions: VcsGitlabMergeDiscussions;

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
  }
}
