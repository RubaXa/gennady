// @file: Pipeline status and job list value object for an MR.
// @consumers: VcsClientMergeRequests
// @tasks: TSK-82, TSK-84

/**
 * @purpose Pipeline status and its job list for a merge request.
 * @invariant status is the overall pipeline state from the VCS; jobs list may be empty.
 */
export type VcsPipelineStatus = {
  /** @purpose Overall pipeline status (e.g. running, success, failed) */
  status: string;
  /** @purpose Individual jobs with their ids, names, and statuses */
  jobs: { id: string; name: string; status: string }[];
};
