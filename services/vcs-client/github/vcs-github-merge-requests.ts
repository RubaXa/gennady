// @file: GitHub-specific implementation of pull request file operations.
// @consumers: VcsGithubClient
// @tasks: TSK-30

import { VcsClientMergeRequests } from '../abstract/vcs-client-merge-requests.ts';
import type {
  VcsMergeRequestChanges,
  VcsMergeRequestChangesQuery,
} from '../entities/vcs-merge-request-changes.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Доступ к файлам Pull Request через GitHub API.
 * @invariant Error Policy: Ошибки сети/статуса пробрасываются наружу из request().
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

  async getList(): Promise<unknown[]> {
    throw new Error('GitHub getList not implemented — use getChanges for PR files');
  }

  async getOne(): Promise<unknown | null> {
    throw new Error('GitHub getOne not implemented');
  }

  async getByIid(): Promise<unknown | null> {
    throw new Error('GitHub getByIid not implemented');
  }

  /**
   * @param query Target repository and PR number, optional pagination.
   * @returns List of changed files with metadata.
   * @sideEffect Network: GET /repos/:owner/:repo/pulls/:number/files
   * @see {VcsClientMergeRequests#getChanges} in services/vcs-client/abstract/vcs-client-merge-requests.ts
   */
  async getChanges(query: VcsMergeRequestChangesQuery): Promise<VcsMergeRequestChanges[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const repo = encodeURIComponent(query.repository);
    const number = encodeURIComponent(String(query.iid));

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
}
