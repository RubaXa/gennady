import { VcsGitlabMergeRequests } from './vcs-merge-requests.ts';
import { VcsGitlabMergeDiscussions } from './vcs-merge-discussions.ts';

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
 * @consumer cli/review-verify
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @invariant Retry Policy: Повторов нет; ответственность за ретраи на вызывающей стороне.
 */
export class VcsGitlabClient {
  MergeRequests: VcsGitlabMergeRequests;
  MergeDiscussions: VcsGitlabMergeDiscussions;

  constructor(options: VcsGitlabClientOptions) {
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
