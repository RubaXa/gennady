// @file: Contract surface for pipeline job management operations.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClient

import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';
import type { VcsPipelineSummary } from '../entities/vcs-pipeline-summary.type.ts';

/** @purpose Exact project and commit identity for read-only provider proof. */
export type VcsPipelineShaQuery = {
  /** @purpose Provider project path containing the commit and pipeline. */
  readonly project: string;
  /** @purpose Exact full source commit identity. */
  readonly sha: string;
  /** @purpose Cooperative deadline/cancellation propagated to the provider request. */
  readonly signal?: AbortSignal;
};

/** @purpose One immutable provider pipeline selected after exact-SHA discovery. */
export type VcsPipelineIdentityQuery = {
  /** @purpose Provider project path containing the pinned pipeline. */
  readonly project: string;
  /** @purpose Immutable provider pipeline/run identity selected after exact-SHA discovery. */
  readonly pipelineId: string;
  /** @purpose Cooperative deadline/cancellation propagated to the provider request. */
  readonly signal?: AbortSignal;
};

/**
 * @purpose Optional port on VcsClient for pipeline job management.
 * @invariant Error Policy: Network/status errors are thrown outward from the transport layer.
 * @consumer VcsClient
 */
export abstract class VcsClientPipeline {
  /** @purpose Prove that the provider can resolve this exact full commit SHA. */
  abstract hasCommit(query: VcsPipelineShaQuery): Promise<boolean>;

  /** @purpose Find only pipelines whose provider source SHA equals the requested SHA. */
  abstract findPipelinesBySha(query: VcsPipelineShaQuery): Promise<readonly VcsPipelineSummary[]>;

  /** @purpose Observe one already-pinned immutable pipeline id. */
  abstract getPipeline(query: VcsPipelineIdentityQuery): Promise<VcsPipelineSummary>;

  /** @purpose Read jobs of one already-pinned immutable pipeline id. */
  abstract getPipelineJobs(query: VcsPipelineIdentityQuery): Promise<readonly VcsJob[]>;

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
  abstract getJobLog(query: VcsJobQuery & { readonly signal?: AbortSignal }): Promise<string>;
}
