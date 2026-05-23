// @file: GitLab-specific implementation of merge request discussion operations.
// @consumers: VcsGitlabClient

import {
  VcsClientMergeDiscussions,
  type VcsAddNoteQuery,
  type VcsDiscussionsListQuery,
} from '../abstract/vcs-client-merge-discussions.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Access to Discussions for Merge Requests in GitLab.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsGitlabClient
 */
export class VcsGitlabMergeDiscussions extends VcsClientMergeDiscussions {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitLab merge discussion endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @param query Target project, MR, discussion, and note body.
   * @returns Created note object from GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
   * @see {VcsClientMergeDiscussions#addNote} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async addNote(query: VcsAddNoteQuery): Promise<unknown> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const discussionId = encodeURIComponent(query.discussionId);
    return this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: query.body }),
      }
    );
  }

  /**
   * @param query Target project, MR, and optional pagination.
   * @returns List of discussions for the requested page.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
   * @see {VcsClientMergeDiscussions#getList} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getList(query: VcsDiscussionsListQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const projectId = encodeURIComponent(query.project);
    const result = await this._request(
      `/projects/${projectId}/merge_requests/${encodeURIComponent(String(query.iid))}/discussions?${params.toString()}`
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * @param query Target project and MR.
   * @returns Complete list of all discussions across all pages.
   * @sideEffect Network: Multiple GET requests for paginated loading.
   * @see {VcsClientMergeDiscussions#getAll} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getAll(query: { project: string; iid: string | number }): Promise<unknown[]> {
    const perPage = 100;
    let page = 1;
    const all: unknown[] = [];

    while (true) {
      const chunk = await this.getList({ ...query, perPage, page });
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < perPage) break;
      page += 1;
    }

    return all;
  }
}
