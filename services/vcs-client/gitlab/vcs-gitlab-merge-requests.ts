// @file: GitLab-specific implementation of merge request operations.
// @consumers: VcsGitlabClient
// @tasks: TSK-29

import {
  VcsClientMergeRequests,
  type VcsMergeRequestByIidQuery,
  type VcsMergeRequestsQuery,
} from '../abstract/vcs-client-merge-requests.ts';
import type {
  VcsMergeRequestChanges,
  VcsMergeRequestChangesQuery,
} from '../entities/vcs-merge-request-changes.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Access GitLab Merge Requests.
 * @invariant Error Policy: Network/status errors propagated to caller.
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
   * @sideEffect Network: Delegates to getList() with per_page=1 limit.
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

  /**
   * @param query Target repository and MR IID, optional pagination.
   * @returns List of changed files with metadata.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/changes
   * @see {VcsClientMergeRequests#getChanges} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getChanges(query: VcsMergeRequestChangesQuery): Promise<VcsMergeRequestChanges[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const repoId = encodeURIComponent(query.repository);
    const iid = encodeURIComponent(String(query.iid));

    const result = (await this._request(
      `/projects/${repoId}/merge_requests/${iid}/changes?${params.toString()}`
    )) as { changes?: Array<Record<string, unknown>>; sha?: string; source_branch?: string };

    const changes = result?.changes ?? [];
    const ref =
      (result as { sha?: string; source_branch?: string }).sha ??
      (result as { source_branch?: string }).source_branch ??
      'main';

    return changes.map((c) => {
      const newPath = (c.new_path as string) ?? (c.old_path as string) ?? '';
      const newFile = c.new_file as boolean | undefined;
      const deletedFile = c.deleted_file as boolean | undefined;
      const renamedFile = c.renamed_file as boolean | undefined;

      let status: VcsMergeRequestChanges['status'] = 'modified';
      if (deletedFile) status = 'deleted';
      else if (newFile) status = 'added';
      else if (renamedFile) status = 'renamed';

      const entry: VcsMergeRequestChanges = {
        path: newPath,
        status,
        ref,
      };

      if (renamedFile && c.old_path) {
        entry.previousPath = c.old_path as string;
      }
      if (typeof c.additions === 'number') entry.additions = c.additions;
      if (typeof c.deletions === 'number') entry.deletions = c.deletions;

      return entry;
    });
  }
}
