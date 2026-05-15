// @file: GitLab-specific implementation of merge request operations.
// @consumers: VcsGitlabClient

import {
  VcsClientMergeRequests,
  type VcsMergeRequestByIidQuery,
  type VcsMergeRequestsQuery,
} from '../abstract/vcs-client-merge-requests.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Доступ к Merge Requests в GitLab.
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 * @consumer VcsGitlabClient
 */
export class VcsGitlabMergeRequests extends VcsClientMergeRequests {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitLab merge request endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @param query Target project and optional filters.
   * @returns List of merge requests matching the filters.
   * @sideEffect Network: GET /projects/:project/merge_requests
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
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
   * @param query Target project and optional filters.
   * @returns First matching merge request or null.
   * @sideEffect Network: Делегирует в getList() с ограничением per_page=1.
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
   */
  async getOne(query: VcsMergeRequestsQuery): Promise<unknown | null> {
    const list = await this.getList({ ...query, perPage: 1 });
    return list.length > 0 ? list[0] : null;
  }

  /**
   * @param query Target project and MR IID.
   * @returns Merge request object or null on 404.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-merge-requests.ts
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
