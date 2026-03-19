import {
  VcsClientMergeRequests,
  type VcsMergeRequestByIidQuery,
  type VcsMergeRequestsQuery,
} from '../abstract/vcs-client-merge-requests.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Доступ к Merge Requests в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeRequests extends VcsClientMergeRequests {
  protected _request: RequestFn;

  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
   * @sideEffect Network: GET /projects/:project/merge_requests
   */
  async getList(query: VcsMergeRequestsQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    const state = query?.state ?? 'opened';
    if (query?.sourceBranch) params.set('source_branch', query.sourceBranch);
    if (state) params.set('state', state);
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const projectId = encodeURIComponent(query.project);
    const result = await this._request(
      `/projects/${projectId}/merge_requests?${params.toString()}`
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
   * @sideEffect Network: Делегирует в getList() с ограничением per_page=1.
   */
  async getOne(query: VcsMergeRequestsQuery): Promise<unknown | null> {
    const list = await this.getList({ ...query, perPage: 1 });
    return list.length > 0 ? list[0] : null;
  }

  /**
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid
   */
  async getByIid(query: VcsMergeRequestByIidQuery): Promise<unknown | null> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    try {
      return await this._request(`/projects/${projectId}/merge_requests/${iid}`);
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('404')) {
        return null;
      }
      throw error;
    }
  }
}
