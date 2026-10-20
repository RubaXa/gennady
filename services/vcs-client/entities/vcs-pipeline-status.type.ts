// @file: Pipeline status, metadata and job list value object for an MR.
// @consumers: VcsClientMergeRequests
// @tasks: TSK-82, TSK-83, TSK-84

/**
 * @purpose Pipeline status, metadata and its job list for a merge request.
 * @invariant status is the overall pipeline state from the VCS; jobs list may be empty.
 * @invariant Metadata fields are optional — adapters that cannot supply them omit them entirely
 *   (absence means "unknown", never an empty string placeholder).
 */
export type VcsPipelineStatus = {
  /** @purpose Overall pipeline status (e.g. running, success, failed) */
  status: string;
  /** @purpose Individual jobs with their ids, names, and statuses */
  jobs: { id: string; name: string; status: string }[];
  /** @purpose Global pipeline id when exposed by the VCS */
  id?: string;
  /** @purpose Project-scoped pipeline iid used in web URLs */
  iid?: string;
  /** @purpose Full commit SHA the pipeline ran against */
  sha?: string;
  /** @purpose Git ref (branch or tag) the pipeline ran against */
  ref?: string;
  /** @purpose First line of the pipeline commit message */
  commitTitle?: string;
  /** @purpose Pipeline creation timestamp (ISO 8601, UTC) */
  createdAt?: string;
  /** @purpose Last pipeline update timestamp (ISO 8601, UTC) */
  updatedAt?: string;
};
