// @file: GitLab REST adapter implementing VcsClientPipeline contract.
// @consumers: VcsGitlabClient
// @tasks: TSK-84

import {
  VcsClientPipeline,
  type VcsPipelineJobsQuery,
  type VcsPipelinesQuery,
} from '../abstract/vcs-client-pipeline.ts';
import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';
import type { VcsPipelineSummary } from '../entities/vcs-pipeline-summary.type.ts';

/** @purpose Custom init options extending standard RequestInit with response type control. */
type RequestInit_ = RequestInit & { responseType?: 'json' | 'text' };
type RequestFn = (path: string, init?: RequestInit_) => Promise<unknown>;

/** @purpose GraphQL request adapter: runs a query, returns the `data` payload. */
type GraphqlRequestFn = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

/** @purpose Extract the numeric tail of a GraphQL global id (gid://gitlab/Ci::Pipeline/123 → 123). */
function extractNumericId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? match[1] : gid;
}

/**
 * @purpose GitLab adapter for pipeline job management (REST jobs + GraphQL pipeline listings).
 * @invariant Error Policy: Network/status errors are thrown outward from request()/graphql().
 * @consumer VcsGitlabClient
 */
export class VcsGitlabPipeline extends VcsClientPipeline {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /** @purpose Bound GraphQL request function for pipeline/job listings */
  protected _graphql: GraphqlRequestFn | undefined;

  /**
   * @purpose Wire the HTTP and optional GraphQL request adapters for GitLab pipeline endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   * @param [graphql] Optional authenticated GraphQL request function for pipeline listings.
   */
  constructor(request: RequestFn, graphql?: GraphqlRequestFn) {
    super();
    this._request = request;
    this._graphql = graphql;
  }

  /**
   * @param query Scoping parameters: project and job ID.
   * @returns Job details from GitLab API.
   * @sideEffect Network: GET /projects/:project/jobs/:job_id
   * @see {VcsClientPipeline#getJob} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async getJob(query: VcsJobQuery): Promise<VcsJob> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = (await this._request(`/projects/${projectId}/jobs/${jobId}`)) as Record<
      string,
      unknown
    >;
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      status: String(raw.status ?? ''),
      stage: String(raw.stage ?? ''),
      ref: String(raw.ref ?? ''),
      webUrl: String(raw.web_url ?? ''),
    };
  }

  /**
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after play is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/play
   * @see {VcsClientPipeline#playJob} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async playJob(query: VcsJobQuery): Promise<VcsJob> {
    return this.postJobAction(query, 'play');
  }

  /**
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after retry is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/retry
   * @see {VcsClientPipeline#retryJob} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async retryJob(query: VcsJobQuery): Promise<VcsJob> {
    return this.postJobAction(query, 'retry');
  }

  /**
   * @purpose POST one job lifecycle action and map the fresh job to the shared shape.
   * @param query Scoping parameters: project and job ID.
   * @param action GitLab job endpoint suffix.
   * @returns Updated job details after the action.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/<action>
   */
  private async postJobAction(query: VcsJobQuery, action: 'play' | 'retry'): Promise<VcsJob> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = (await this._request(`/projects/${projectId}/jobs/${jobId}/${action}`, {
      method: 'POST',
    })) as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      status: String(raw.status ?? ''),
      stage: String(raw.stage ?? ''),
      ref: String(raw.ref ?? ''),
      webUrl: String(raw.web_url ?? ''),
    };
  }

  /**
   * @param query Scoping parameters: project and job ID.
   * @returns Updated job details after cancellation.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/cancel
   * @see {VcsClientPipeline#cancelJob} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async cancelJob(query: VcsJobQuery): Promise<VcsJob> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = (await this._request(`/projects/${projectId}/jobs/${jobId}/cancel`, {
      method: 'POST',
    })) as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      status: String(raw.status ?? ''),
      stage: String(raw.stage ?? ''),
      ref: String(raw.ref ?? ''),
      webUrl: String(raw.web_url ?? ''),
    };
  }

  /**
   * @param query Scoping parameters: project and job ID.
   * @returns Raw log text from the job runner.
   * @sideEffect Network: GET /projects/:project/jobs/:job_id/trace
   * @see {VcsClientPipeline#getJobLog} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async getJobLog(query: VcsJobQuery): Promise<string> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = await this._request(`/projects/${projectId}/jobs/${jobId}/trace`, {
      responseType: 'text',
    });
    return String(raw ?? '');
  }

  /**
   * @param query Scoping parameters: project, optional ref/sha/limit.
   * @throws {Error} When GraphQL transport is not configured.
   * @returns Compact pipeline summaries, newest first.
   * @sideEffect Network: GraphQL project.pipelines(ref:, sha:, first:)
   * @see {VcsClientPipeline#getPipelines} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async getPipelines(query: VcsPipelinesQuery): Promise<VcsPipelineSummary[]> {
    if (!this._graphql) {
      throw new Error('[VcsGitlabPipeline#getPipelines] GraphQL transport not configured');
    }

    const data = (await this._graphql(
      `query Pipelines($project: ID!, $ref: String, $sha: String, $first: Int!) {
        project(fullPath: $project) {
          pipelines(ref: $ref, sha: $sha, first: $first) {
            nodes { id iid sha ref status createdAt updatedAt commit { title } }
          }
        }
      }`,
      {
        project: query.project,
        ref: query.ref ?? null,
        sha: query.sha ?? null,
        first: query.limit ?? 10,
      }
    )) as {
      project?: {
        pipelines?: {
          nodes?: Array<{
            id?: string;
            iid?: string;
            sha?: string;
            ref?: string;
            status?: string;
            createdAt?: string;
            updatedAt?: string;
            commit?: { title?: string } | null;
          } | null>;
        } | null;
      } | null;
    };

    const nodes = data?.project?.pipelines?.nodes ?? [];
    return nodes
      .filter((node) => node != null)
      .map((node) => ({
        id: extractNumericId(String(node.id ?? '')),
        iid: String(node.iid ?? ''),
        status: String(node.status ?? '').toUpperCase(),
        sha: String(node.sha ?? ''),
        ref: String(node.ref ?? ''),
        createdAt: String(node.createdAt ?? ''),
        updatedAt: String(node.updatedAt ?? ''),
        title: String(node.commit?.title ?? ''),
      }));
  }

  /**
   * @param query Scoping parameters: project and pipeline iid.
   * @throws {Error} When GraphQL transport is not configured.
   * @returns Job list with ids, names and raw statuses.
   * @sideEffect Network: GraphQL project.pipeline(iid:){jobs}
   * @see {VcsClientPipeline#getPipelineJobs} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async getPipelineJobs(
    query: VcsPipelineJobsQuery
  ): Promise<{ id: string; name: string; status: string }[]> {
    if (!this._graphql) {
      throw new Error('[VcsGitlabPipeline#getPipelineJobs] GraphQL transport not configured');
    }

    const data = (await this._graphql(
      `query PipelineJobs($project: ID!, $iid: ID!) {
        project(fullPath: $project) {
          pipeline(iid: $iid) { jobs { nodes { id name status } } }
        }
      }`,
      { project: query.project, iid: query.pipelineId }
    )) as {
      project?: {
        pipeline?: {
          jobs?: { nodes?: Array<{ id?: string; name?: string; status?: string } | null> } | null;
        } | null;
      } | null;
    };

    const nodes = data?.project?.pipeline?.jobs?.nodes ?? [];
    return nodes
      .filter((node) => node != null)
      .map((node) => ({
        id: String(node.id ?? ''),
        name: String(node.name ?? ''),
        status: String(node.status ?? ''),
      }));
  }
}
