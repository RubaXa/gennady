// @file: GitLab REST adapter implementing VcsClientPipeline contract.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsGitlabClient

import {
  VcsClientPipeline,
  type VcsPipelineIdentityQuery,
  type VcsPipelineShaQuery,
} from '../abstract/vcs-client-pipeline.ts';
import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';
import type { VcsPipelineSummary } from '../entities/vcs-pipeline-summary.type.ts';

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
   * @purpose Prove that GitLab resolves the requested exact commit identity.
   * @param query Exact project and full commit SHA.
   * @returns Whether GitLab returned the same full SHA.
   */
  async hasCommit(query: VcsPipelineShaQuery): Promise<boolean> {
    const project = encodeURIComponent(query.project);
    const sha = encodeURIComponent(query.sha);
    try {
      const raw = (await this._request(`/projects/${project}/repository/commits/${sha}`, {
        signal: query.signal,
      })) as {
        id?: unknown;
      };
      return raw.id === query.sha;
    } catch (cause) {
      if (/\b404\b/.test(cause instanceof Error ? cause.message : String(cause))) return false;
      throw cause;
    }
  }

  /**
   * @purpose List only pipelines returned by GitLab's exact sha filter.
   * @param query Exact project and full commit SHA.
   * @returns Bounded complete pipeline candidates for caller-side exact validation.
   */
  async findPipelinesBySha(query: VcsPipelineShaQuery): Promise<readonly VcsPipelineSummary[]> {
    const project = encodeURIComponent(query.project);
    const result: VcsPipelineSummary[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const parameters = new URLSearchParams({
        sha: query.sha,
        per_page: '100',
        page: String(page),
      });
      const raw = await this._request(`/projects/${project}/pipelines?${parameters.toString()}`, {
        signal: query.signal,
      });
      if (!Array.isArray(raw))
        throw new Error('GitLab pipeline search returned an invalid payload');
      result.push(...raw.map((value) => this.pipelineSummary(value)));
      if (raw.length < 100) return result;
    }
    throw new Error('GitLab pipeline search exceeded the bounded pagination limit');
  }

  /**
   * @purpose Observe one already-pinned immutable GitLab pipeline id.
   * @param query Exact project and immutable pipeline id.
   * @returns Validated pipeline identity and raw status.
   */
  async getPipeline(query: VcsPipelineIdentityQuery): Promise<VcsPipelineSummary> {
    const project = encodeURIComponent(query.project);
    const pipelineId = encodeURIComponent(query.pipelineId);
    return this.pipelineSummary(
      await this._request(`/projects/${project}/pipelines/${pipelineId}`, {
        signal: query.signal,
      })
    );
  }

  /**
   * @purpose Read the bounded complete job set for one pinned GitLab pipeline.
   * @param query Exact project and immutable pipeline id.
   * @returns Validated provider jobs from bounded pagination.
   */
  async getPipelineJobs(query: VcsPipelineIdentityQuery): Promise<readonly VcsJob[]> {
    const project = encodeURIComponent(query.project);
    const pipelineId = encodeURIComponent(query.pipelineId);
    const result: VcsJob[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const raw = await this._request(
        `/projects/${project}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true&page=${page}`,
        { signal: query.signal }
      );
      if (!Array.isArray(raw)) throw new Error('GitLab pipeline jobs returned an invalid payload');
      result.push(
        ...raw.map((value) => {
          const job = value as Record<string, unknown>;
          const id = typeof job.id === 'number' || typeof job.id === 'string' ? String(job.id) : '';
          const name = typeof job.name === 'string' ? job.name : '';
          const status = typeof job.status === 'string' ? job.status : '';
          if (id === '' || name === '' || status === '') {
            throw new Error('GitLab pipeline job endpoint omitted id, name, or status');
          }
          return {
            id,
            name,
            status,
            stage: String(job.stage ?? ''),
            ref: String(job.ref ?? ''),
            webUrl: String(job.web_url ?? ''),
          };
        })
      );
      if (raw.length < 100) return result;
    }
    throw new Error('GitLab pipeline jobs exceeded the bounded pagination limit');
  }

  /**
   * @purpose Validate required GitLab pipeline identity without empty-string invention.
   * @param value Untrusted GitLab pipeline response.
   * @returns Required immutable identity and raw provider status.
   */
  private pipelineSummary(value: unknown): VcsPipelineSummary {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('GitLab pipeline endpoint returned an invalid payload');
    }
    const raw = value as Record<string, unknown>;
    const id = typeof raw.id === 'number' || typeof raw.id === 'string' ? String(raw.id) : '';
    const sha = typeof raw.sha === 'string' ? raw.sha : '';
    const status = typeof raw.status === 'string' ? raw.status : '';
    const source = typeof raw.source === 'string' ? raw.source : '';
    if (id === '' || sha === '' || status === '' || source === '') {
      throw new Error('GitLab pipeline endpoint omitted id, sha, status, or source');
    }
    return {
      id,
      sha,
      status,
      definitionId: `source:${source}`,
      ...(typeof raw.ref === 'string' ? { ref: raw.ref } : {}),
      ...(typeof raw.created_at === 'string' ? { createdAt: raw.created_at } : {}),
      ...(typeof raw.updated_at === 'string' ? { updatedAt: raw.updated_at } : {}),
      ...(typeof raw.name === 'string' ? { title: raw.name } : {}),
    };
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
  async getJobLog(query: VcsJobQuery & { readonly signal?: AbortSignal }): Promise<string> {
    const projectId = encodeURIComponent(query.project);
    const jobId = encodeURIComponent(query.jobId);
    const raw = await this._request(`/projects/${projectId}/jobs/${jobId}/trace`, {
      responseType: 'text',
      signal: query.signal,
    });
    return String(raw ?? '');
  }
}
