// @file: GitHub-specific implementation of pull request file operations.
// @consumers: VcsGithubClient
// @tasks: TSK-30, TSK-67, TSK-73, TSK-82, TSK-84, TSK-88, TSK-90

import {
  VcsClientMergeRequests,
  type VcsMergeRequestByIidQuery,
  type VcsMergeRequestsQuery,
  type VcsPipelineQuery,
} from '../abstract/vcs-client-merge-requests.ts';
import type {
  VcsMergeRequestChanges,
  VcsMergeRequestChangesQuery,
} from '../entities/vcs-merge-request-changes.type.ts';
import type { VcsMergeRequestApproveQuery } from '../entities/vcs-merge-request-approve-query.type.ts';
import type { VcsMergeRequestCreateQuery } from '../entities/vcs-merge-request-create-query.type.ts';
import type { VcsMergeRequestUpdateQuery } from '../entities/vcs-merge-request-update-query.type.ts';
import type { VcsPipelineStatus } from '../entities/vcs-pipeline-status.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

function normalizePr(pr: Record<string, unknown>): Record<string, unknown> {
  return {
    ...pr,
    iid: pr.number,
    webUrl: pr.html_url,
  };
}

/**
 * @purpose Access to Pull Request files via GitHub API.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsGithubClient
 */
export class VcsGithubMergeRequests extends VcsClientMergeRequests {
  /** @purpose Bound HTTP request function for GitHub API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitHub PR endpoints.
   * @param request Authenticated HTTP request function targeting GitHub API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @purpose List pull requests by repository and optional filters.
   * @param query Parameters: { project (owner/repo), sourceBranch? (head), state?, perPage?, page? }.
   * @returns List of pull requests matching filters.
   * @sideEffect Network: GET /repos/:owner/:repo/pulls
   * @see {VcsClientMergeRequests#getList} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getList(query: VcsMergeRequestsQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    const state = query.state ?? 'open';
    params.set('state', state);
    if (query.sourceBranch) params.set('head', query.sourceBranch);
    if (query.perPage) params.set('per_page', String(query.perPage));
    if (query.page) params.set('page', String(query.page));

    const result = await this._request(`/repos/${query.project}/pulls?${params.toString()}`);
    return (Array.isArray(result) ? result : []).map(normalizePr);
  }

  /**
   * @purpose Get first pull request matching filters.
   * @param query Query object.
   * @returns First found PR or null.
   * @sideEffect Network: Delegates to getList() with per_page=1 limit.
   * @see {VcsClientMergeRequests#getOne} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getOne(query: VcsMergeRequestsQuery): Promise<unknown | null> {
    const list = await this.getList({ ...query, perPage: 1 });
    return list.length > 0 ? list[0] : null;
  }

  /**
   * @purpose Get pull request by number within a repository.
   * @param query Parameters: { project (owner/repo), iid (PR number) }.
   * @returns Pull request object or null on 404.
   * @sideEffect Network: GET /repos/:owner/:repo/pulls/:number
   * @see {VcsClientMergeRequests#getByIid} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getByIid(query: VcsMergeRequestByIidQuery): Promise<unknown | null> {
    try {
      const pr = (await this._request(
        `/repos/${query.project}/pulls/${String(query.iid)}`
      )) as Record<string, unknown>;
      return normalizePr(pr);
    } catch (error) {
      if ((error as Error).message?.includes('404')) return null;
      throw error;
    }
  }

  /**
   * @purpose GitHub approve not implemented — deferred per scope spec.
   * @param _query Parameters: { repository, iid }.
   * @throws Error that the operation is not implemented.
   */
  async approve(_query: VcsMergeRequestApproveQuery): Promise<void> {
    throw new Error('GitHub approve not implemented');
  }

  /**
   * @purpose GitHub unapprove not implemented — deferred per scope spec.
   * @param _query Parameters: { repository, iid }.
   * @throws Error that the operation is not implemented.
   */
  async unapprove(_query: VcsMergeRequestApproveQuery): Promise<void> {
    throw new Error('GitHub unapprove not implemented');
  }

  /**
   * @purpose GitHub getPipeline not implemented — deferred per scope spec.
   * @param _query Parameters: { project, iid }.
   * @throws Error that the operation is not implemented.
   */
  async getPipeline(_query: VcsPipelineQuery): Promise<VcsPipelineStatus> {
    throw new Error('GitHub getPipeline not implemented');
  }

  /**
   * @purpose Get list of changed files in a pull request.
   * @param query Target repository and PR number, optional pagination.
   * @returns List of changed files with metadata.
   * @sideEffect Network: GET /repos/:owner/:repo/pulls/:number/files
   * @see {VcsClientMergeRequests#getChanges} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getChanges(query: VcsMergeRequestChangesQuery): Promise<VcsMergeRequestChanges[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const repo = query.repository;
    const number = String(query.iid);

    const [prData, filesData] = await Promise.all([
      this._request(`/repos/${repo}/pulls/${number}`) as Promise<Record<string, unknown>>,
      this._request(`/repos/${repo}/pulls/${number}/files?${params.toString()}`) as Promise<
        Array<Record<string, unknown>>
      >,
    ]);

    const headRef =
      ((prData?.head as Record<string, unknown> | undefined)?.ref as string | undefined) ?? 'main';
    const files = Array.isArray(filesData) ? filesData : [];

    return files.map((f) => {
      const filename = (f.filename as string) ?? '';
      const status = (f.status as string) ?? 'modified';
      const additions = f.additions as number | undefined;
      const deletions = f.deletions as number | undefined;

      let mappedStatus: VcsMergeRequestChanges['status'] = 'modified';
      if (status === 'added') mappedStatus = 'added';
      else if (status === 'removed') mappedStatus = 'deleted';
      else if (status === 'renamed') mappedStatus = 'renamed';

      const entry: VcsMergeRequestChanges = {
        path: filename,
        status: mappedStatus,
        ref: headRef,
      };

      if (mappedStatus === 'renamed' && f.previous_filename) {
        entry.previousPath = f.previous_filename as string;
      }
      if (typeof additions === 'number') entry.additions = additions;
      if (typeof deletions === 'number') entry.deletions = deletions;

      return entry;
    });
  }

  /**
   * @purpose Create a new GitHub Pull Request.
   * @param query Parameters: { project (owner/repo), title, sourceBranch (head), ... }.
   * @returns Created PR object.
   * @sideEffect Network: POST /repos/:owner/:repo/pulls
   * @see {VcsClientMergeRequests#create} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async create(query: VcsMergeRequestCreateQuery): Promise<unknown> {
    const body: Record<string, unknown> = {
      head: query.sourceBranch,
      title: query.title,
    };
    if (query.targetBranch) body.base = query.targetBranch;
    if (query.description) body.body = query.description;
    if (query.draft) body.draft = true;
    if (query.labels?.length) body.labels = query.labels;
    if (query.assigneeIds?.length) body.assignees = query.assigneeIds;
    if (query.reviewerIds?.length) body.reviewers = query.reviewerIds;
    if (query.milestoneId) body.milestone = query.milestoneId;

    const result = (await this._request(`/repos/${query.project}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })) as Record<string, unknown>;

    return {
      webUrl: result.html_url ?? '',
      iid: result.number ?? 0,
      title: result.title ?? '',
    };
  }

  /**
   * @purpose Update an existing GitHub Pull Request.
   * @param query Guaranteed-non-empty validated update query from abstract port.
   * @returns Updated PR object.
   * @sideEffect Network: PATCH /repos/:owner/:repo/pulls/:number
   * @see {VcsClientMergeRequests#_doUpdate} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  protected async _doUpdate(query: VcsMergeRequestUpdateQuery): Promise<unknown> {
    const body: Record<string, unknown> = {};
    if (query.title !== undefined) body.title = query.title;
    if (query.description !== undefined) body.body = query.description;
    if (query.targetBranch) body.base = query.targetBranch;
    if (query.draft !== undefined) body.draft = query.draft;

    if (query.addLabels?.length || query.removeLabels?.length) {
      const pr = (await this._request(
        `/repos/${query.project}/pulls/${String(query.iid)}`
      )) as { labels?: Array<{ name: string }> };
      const currentLabels = (pr.labels ?? []).map((l) => l.name);
      const added = query.addLabels ?? [];
      const removed = query.removeLabels ?? [];
      const newLabels = [
        ...new Set([...currentLabels, ...added].filter((l) => !removed.includes(l))),
      ];
      body.labels = newLabels;
    }

    const result = (await this._request(
      `/repos/${query.project}/pulls/${String(query.iid)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    return {
      webUrl: result.html_url ?? '',
      iid: result.number ?? 0,
      title: result.title ?? '',
    };
  }
}
