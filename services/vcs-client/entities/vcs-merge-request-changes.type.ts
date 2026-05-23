// @file: Merge Request / Pull Request changed files — list with metadata.
// @consumers: VcsClientMergeRequests.getChanges
// @tasks: TSK-27

/**
 * @purpose One changed file in MR/PR: path, status, branch, change metrics.
 * @consumer VcsClientMergeRequests.getChanges
 */
export type VcsMergeRequestChanges = {
  /** @purpose File path (new_path for GitLab, filename for GitHub) */
  path: string;
  /** @purpose Change status: added, modified, deleted, renamed */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** @purpose Previous path (only for renamed) */
  previousPath?: string;
  /** @purpose Branch (source_branch GitLab / head.ref GitHub) — for getFileContent */
  ref: string;
  /** @purpose Number of added lines */
  additions?: number;
  /** @purpose Number of deleted lines */
  deletions?: number;
};

/**
 * @purpose MR/PR changes query parameters: repository, number, pagination.
 * @consumer VcsClientMergeRequests.getChanges
 */
export type VcsMergeRequestChangesQuery = {
  /** @purpose Repository identifier (group/project or owner/repo) */
  repository: string;
  /** @purpose MR number (IID) or PR (number) */
  iid: string | number;
  /** @purpose Page number (starting from 1) */
  page?: number;
  /** @purpose Page size */
  perPage?: number;
};
