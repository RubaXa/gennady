// @file: Contract surface for merge request / pull request operations.
// @consumers: VcsClient
// @tasks: TSK-28

import type {
  VcsMergeRequestChanges,
  VcsMergeRequestChangesQuery,
} from '../entities/vcs-merge-request-changes.type.ts';

/**
 * @purpose Parameters for querying Merge Request list: project, branch, state, pagination.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestsQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Source branch name to filter MRs */
  sourceBranch?: string;
  /** @purpose MR state filter: opened, closed, merged, etc. */
  state?: string;
  /** @purpose Page size | @invariant Default: GitLab default when absent */
  perPage?: number;
  /** @purpose Page number starting from 1 */
  page?: number;
};

/**
 * @purpose Parameters for querying a Merge Request by IID.
 * @consumer VcsClientMergeRequests
 */
export type VcsMergeRequestByIidQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
};

/**
 * @purpose Access to Merge Requests/Pull Requests.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsClient
 */
export abstract class VcsClientMergeRequests {
  /**
   * @purpose Get MR list by project and filters.
   * @param query Query object.
   * @returns List of Merge Requests by minimal filters.
   * @sideEffect Network: GET /projects/:project/merge_requests
   */
  abstract getList(query: VcsMergeRequestsQuery): Promise<unknown[]>;

  /**
   * @purpose Get the first MR matching the same filters as getList.
   * @param query Query object.
   * @returns First found MR or null.
   * @sideEffect Network: Delegates to getList() with per_page=1 limit.
   */
  abstract getOne(query: VcsMergeRequestsQuery): Promise<unknown | null>;

  /**
   * @purpose Get Merge Request by IID within a project.
   * @param query Parameters: { project, iid }.
   * @returns Merge Request object or null on 404.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid
   */
  abstract getByIid(query: VcsMergeRequestByIidQuery): Promise<unknown | null>;

  /**
   * @purpose Get list of changed files in MR/PR.
   * @param query Parameters: { repository, iid, page?, perPage? }.
   * @returns List of changed files with metadata.
   * @sideEffect Network: GitLab GET /projects/:id/merge_requests/:iid/changes | GitHub GET /repos/:owner/:repo/pulls/:number/files
   */
  abstract getChanges(
    query: VcsMergeRequestChangesQuery
  ): Promise<VcsMergeRequestChanges[]>;
}
