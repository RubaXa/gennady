// @file: Single pipeline job details returned by getJob / playJob / cancelJob.
// @consumers: VcsClientPipeline
// @tasks: TSK-84

/** @purpose Normalized representation of a single CI/CD pipeline job. */
export type VcsJob = {
  /** @purpose Unique job identifier in the VCS system */
  id: string;
  /** @purpose Human-readable job name (e.g. "lint", "test") */
  name: string;
  /** @purpose Current job status (e.g. running, success, failed) */
  status: string;
  /** @purpose Pipeline stage this job belongs to (e.g. "test", "deploy") */
  stage: string;
  /** @purpose Git ref (branch or tag) the job ran against */
  ref: string;
  /** @purpose Full URL to the job detail page in the VCS web UI */
  webUrl: string;
};
