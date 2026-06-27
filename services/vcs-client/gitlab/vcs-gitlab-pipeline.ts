// @file: GitLab REST adapter implementing VcsClientPipeline contract.
// @consumers: VcsGitlabClient
// @tasks: TSK-84

import { VcsClientPipeline } from '../abstract/vcs-client-pipeline.ts';
import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';

/** @purpose Custom init options extending standard RequestInit with response type control. */
type RequestInit_ = RequestInit & { responseType?: 'json' | 'text' };
type RequestFn = (path: string, init?: RequestInit_) => Promise<unknown>;

/**
 * @purpose GitLab REST adapter for pipeline job management.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsGitlabClient
 */
export class VcsGitlabPipeline extends VcsClientPipeline {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /**
 * @purpose Wire the HTTP request adapter for GitLab job endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
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
   * @returns Updated job details after retry is initiated.
   * @sideEffect Network: POST /projects/:project/jobs/:job_id/play
   * @see {VcsClientPipeline#playJob} in services/vcs-client/abstract/vcs-client-pipeline.ts
   */
  async playJob(query: VcsJobQuery): Promise<VcsJob> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = (await this._request(`/projects/${projectId}/jobs/${jobId}/play`, {
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
}
