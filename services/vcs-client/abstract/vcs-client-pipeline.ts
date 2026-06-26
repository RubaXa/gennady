// @file: Contract surface for pipeline job management operations.
// @consumers: VcsClient
// @tasks: TSK-84

import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';

/**
 * @purpose Optional port on VcsClient for pipeline job management.
 * @invariant Error Policy: Network/status errors are thrown outward from the transport layer.
 * @consumer VcsClient
 */
export abstract class VcsClientPipeline {
  /**
   * @purpose Retrieve details of a single pipeline job.
   * @param query Scoping parameters: project and job ID.
   * @returns Job details including status, stage, ref, and web URL.
   * @sideEffect Network: GET /projects/:project/jobs/:job_id
   */
  abstract getJob(query: VcsJobQuery): Promise<VcsJob>;

  /**
   * @purpose Retry (re-play) a failed or canceled pipeline job.
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after retry is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/play
   */
  abstract playJob(query: VcsJobQuery): Promise<VcsJob>;

  /**
   * @purpose Cancel a running or pending pipeline job.
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after cancellation.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/cancel
   */
  abstract cancelJob(query: VcsJobQuery): Promise<VcsJob>;

  /**
   * @purpose Retrieve the raw log output (trace) of a pipeline job.
   * @param query Scoping parameters: project and job ID.
   * @returns Raw log text from the job runner.
   * @sideEffect Network: GET /projects/:project/jobs/:job_id/trace
   */
  abstract getJobLog(query: VcsJobQuery): Promise<string>;
}
