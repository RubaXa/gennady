// @file: GitLab-specific implementation of merge request operations.
// @consumers: VcsGitlabClient
// @tasks: TSK-29, TSK-67, TSK-73

import {
  VcsClientMergeRequests,
  type VcsMergeRequestByIidQuery,
  type VcsMergeRequestsQuery,
} from '../abstract/vcs-client-merge-requests.ts';
import type {
  VcsMergeRequestChanges,
  VcsMergeRequestChangesQuery,
} from '../entities/vcs-merge-request-changes.type.ts';
import type { VcsMergeRequestApproveQuery } from '../entities/vcs-merge-request-approve-query.type.ts';
import { logger } from '#logger';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/** @purpose Machine-readable error codes returned by GitLab MR approve endpoint. */
export type VcsApproveErrorCode = 'ALREADY_APPROVED' | 'SELF_APPROVE_FORBIDDEN' | 'CANNOT_APPROVE';

/**
 * @purpose Domain error thrown when MR approve operation fails with a known rejection reason.
 * @invariant `code` is always one of the known VcsApproveErrorCode values; never undefined.
 */
export class VcsApproveError extends Error {
  /** @purpose Machine-readable error code for programmatic handling */
  readonly code: VcsApproveErrorCode;

  /**
   * @purpose Create an approve error with a known code and the original server message.
   * @param code Machine-readable reason code.
   * @param message Original error message from the server response.
   */
  constructor(code: VcsApproveErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'VcsApproveError';
  }
}

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

  /**
   * @param query Target repository and MR IID.
   * @returns Resolves on successful approve; rejects with VcsApproveError on known failure.
   * @sideEffect Network: POST /projects/:id/merge_requests/:iid/approve
   * @see {VcsClientMergeRequests#approve} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async approve(query: VcsMergeRequestApproveQuery): Promise<void> {
    const repoId = encodeURIComponent(query.repository);
    const iid = encodeURIComponent(String(query.iid));

    // #region START_APPROVE_API_CALL — invariant: error message text from GitLab response body determines VcsApproveErrorCode
    try {
      await this._request(`/projects/${repoId}/merge_requests/${iid}/approve`, {
        method: 'POST',
      });
    } catch (cause) {
      logger.error(`[VcsGitlabMergeRequests#approve] [approving → failed]`, { cause });

      const message = (cause as Error).message ?? '';

      // #region START_MAP_ERROR_TO_DOMAIN
      // purpose: translate GitLab HTTP error responses into typed domain errors with programmatic codes
      // failure mode: adding/removing a code branch changes the public error surface; consumers depend on exact codes
      if (message.includes('already approved')) {
        throw new VcsApproveError('ALREADY_APPROVED', message);
      }
      if (message.includes('its author')) {
        throw new VcsApproveError('SELF_APPROVE_FORBIDDEN', message);
      }
      if (message.includes('cannot be approved')) {
        throw new VcsApproveError('CANNOT_APPROVE', message);
      }
      // #endregion END_MAP_ERROR_TO_DOMAIN

      throw cause;
    }
    // #endregion END_APPROVE_API_CALL
  }

  /**
   * @param query Target repository and MR IID.
   * @throws {Error} When GitLab rejects the unapprove operation (e.g. 403 self-unapprove forbidden).
   * @returns Resolves on successful unapprove; resolves silently on 409 Not Approved.
   * @sideEffect Network: POST /projects/:id/merge_requests/:iid/unapprove
   * @see {VcsClientMergeRequests#unapprove} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async unapprove(query: VcsMergeRequestApproveQuery): Promise<void> {
    const repoId = encodeURIComponent(query.repository);
    const iid = encodeURIComponent(String(query.iid));

    // #region START_UNAPPROVE_API_CALL — invariant: 409 Not Approved is idempotent (informs caller, returns void); 403 is a domain error
    try {
      await this._request(`/projects/${repoId}/merge_requests/${iid}/unapprove`, {
        method: 'POST',
      });
    } catch (cause) {
      const message = (cause as Error).message ?? '';

      // #region START_HANDLE_IDEMPOTENT_409
      // purpose: 409 Not Approved is not a failure — the desired state (unapproved) is already achieved
      if (message.includes('409')) {
        logger.info(
          `[VcsGitlabMergeRequests#unapprove] [unapproving → idempotent] MR not approved`
        );
        return;
      }
      // #endregion END_HANDLE_IDEMPOTENT_409

      logger.error(`[VcsGitlabMergeRequests#unapprove] [unapproving → failed]`, { cause });

      throw cause;
    }
    // #endregion END_UNAPPROVE_API_CALL
  }
}
