import {
  VcsClientMergeDiscussions,
  type VcsAddNoteQuery,
  type VcsDiscussionsListQuery,
} from '../abstract/vcs-client-merge-discussions.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Доступ к Discussions для Merge Request в GitLab.
 * @consumer VcsGitlabClient
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
 */
export class VcsGitlabMergeDiscussions extends VcsClientMergeDiscussions {
  protected _request: RequestFn;

  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @see {VcsClientMergeDiscussions#addNote} in services/vcs-client/abstract/vcs-merge-discussions.ts
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
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
   * @see {VcsClientMergeDiscussions#getList} in services/vcs-client/abstract/vcs-merge-discussions.ts
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
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
   * @see {VcsClientMergeDiscussions#getAll} in services/vcs-client/abstract/vcs-merge-discussions.ts
   * @sideEffect Network: Многократные GET для постраничной загрузки.
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
