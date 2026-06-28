// @file: Parameters for creating a merge request / pull request.
// @consumers: VcsClientMergeRequests.create
// @tasks: TSK-88

/**
 * @purpose Parameters for creating a new Merge Request / Pull Request.
 * @consumer VcsClientMergeRequests.create
 */
export type VcsMergeRequestCreateQuery = {
  /** @purpose Project full path (e.g. group/subgroup/project or owner/repo) */
  project: string;
  /** @purpose MR title */
  title: string;
  /** @purpose MR description in Markdown */
  description?: string;
  /** @purpose Source branch (the branch to merge FROM) */
  sourceBranch: string;
  /** @purpose Target branch (the branch to merge INTO) | @invariant CLI always fills this via cascade; adapter resolves from provider default when absent */
  targetBranch?: string;
  /** @purpose Create as draft/WIP | @invariant Default: false (regular MR) */
  draft?: boolean;
  /** @purpose Labels as comma-separated string (GitLab) or string array (GitHub) */
  labels?: string[];
  /** @purpose Assignee user IDs */
  assigneeIds?: (string | number)[];
  /** @purpose Reviewer user IDs */
  reviewerIds?: (string | number)[];
  /** @purpose Milestone ID */
  milestoneId?: string | number;
};
