// @file: Query parameters for pipeline job operations.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClientPipeline

/** @purpose Scoping parameters for a single pipeline job API call. */
export type VcsJobQuery = {
  /** @purpose VCS project path or ID */
  project: string;
  /** @purpose Unique job identifier */
  jobId: string;
};
