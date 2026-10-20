// @file: Contract surface for pipeline job management operations.
// @consumers: VcsClient
// @tasks: TSK-84

import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';
import type { VcsPipelineSummary } from '../entities/vcs-pipeline-summary.type.ts';

/**
 * @purpose Parameters for listing pipelines of a project without a merge request.
 * @invariant At least one of ref/sha narrows the query; both omitted means "latest pipelines".
 * @consumer VcsClientPipeline
 */
export type VcsPipelinesQuery = {
  /** @purpose Project path (group/repo) */
  project: string;
  /** @purpose Restrict to pipelines of this git ref (branch or tag) */
  ref?: string;
  /** @purpose Restrict to pipelines of this exact commit SHA */
  sha?: string;
  /** @purpose Maximum number of pipelines to return */
  limit?: number;
};

/**
 * @purpose Parameters for listing the jobs of one concrete pipeline.
 * @consumer VcsClientPipeline
 */
export type VcsPipelineJobsQuery = {
  /** @purpose Project path (group/repo) */
  project: string;
  /** @purpose Project-scoped pipeline iid */
  pipelineId: string;
};

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
   * @purpose Start a manual or playable pipeline job.
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after play is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/play
   */
  abstract playJob(query: VcsJobQuery): Promise<VcsJob>;

  /**
   * @purpose Retry a failed or canceled pipeline job on a new attempt.
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after retry is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/retry
   */
  abstract retryJob(query: VcsJobQuery): Promise<VcsJob>;

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

  /**
   * @purpose List recent pipelines of a project, optionally narrowed by ref or commit SHA.
   * @invariant Results are newest-first.
   * @param query Scoping parameters: project, optional ref/sha and limit.
   * @returns Compact pipeline summaries, newest first.
   * @sideEffect Network: GET /projects/:project/pipelines?ref=&sha=
   */
  abstract getPipelines(query: VcsPipelinesQuery): Promise<VcsPipelineSummary[]>;

  /**
   * @purpose List the jobs of one concrete pipeline (no merge request required).
   * @param query Scoping parameters: project and pipeline iid.
   * @returns Job list with ids, names and raw statuses.
   * @sideEffect Network: GET /projects/:project/pipelines/:pipeline_id/jobs
   */
  abstract getPipelineJobs(
    query: VcsPipelineJobsQuery
  ): Promise<{ id: string; name: string; status: string }[]>;
}
