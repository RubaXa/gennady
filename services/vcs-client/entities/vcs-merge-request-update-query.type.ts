// @file: Parameters for updating a merge request / pull request.
// @consumers: VcsClientMergeRequests.update
// @tasks: TSK-88

/**
 * @purpose Parameters for editing an existing Merge Request / Pull Request.
 * @invariant At least one optional field (besides project + iid) must be set.
 *   Validated at abstract port — adapters receive non-empty query.
 * @consumer VcsClientMergeRequests.update
 */
export type VcsMergeRequestUpdateQuery = {
  /** @purpose Project full path (e.g. group/subgroup/project or owner/repo) */
  project: string;
  /** @purpose MR internal ID within the project */
  iid: string | number;
  /** @purpose New title */
  title?: string;
  /** @purpose New description in Markdown */
  description?: string;
  /** @purpose Toggle draft/WIP status (see D-001 for GitLab title-prefix mapping) */
  draft?: boolean;
  /** @purpose Labels to add (without removing existing) */
  addLabels?: string[];
  /** @purpose Labels to remove */
  removeLabels?: string[];
  /** @purpose New assignee user IDs (replaces existing) */
  assigneeIds?: (string | number)[];
  /** @purpose New reviewer user IDs (replaces existing) */
  reviewerIds?: (string | number)[];
  /** @purpose New target branch */
  targetBranch?: string;
  /** @purpose New milestone ID */
  milestoneId?: string | number;
};
