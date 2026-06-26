// @file: Pipeline status and job list value object for an MR.
// @consumers: VcsClientMergeRequests
// @tasks: TSK-82

/**
 * @purpose Pipeline status and its job list for a merge request.
 * @invariant status is the overall pipeline state from the VCS; jobs list may be empty.
 */
export type VcsPipeline = {
  /** @purpose Overall pipeline status (e.g. running, success, failed) */
  status: string;
  /** @purpose Individual job names and their statuses in the pipeline */
  jobs: { name: string; status: string }[];
};
