// @file: GitHub Actions read-only exact-SHA pipeline observation adapter.
// @spec: CLI-VERIFY
// @consumers: VcsGithubClient

import {
  VcsClientPipeline,
  type VcsPipelineIdentityQuery,
  type VcsPipelineShaQuery,
} from '../abstract/vcs-client-pipeline.ts';
import type { VcsJob } from '../entities/vcs-job.type.ts';
import type { VcsJobQuery } from '../entities/vcs-job-query.type.ts';
import type { VcsPipelineSummary } from '../entities/vcs-pipeline-summary.type.ts';

type RequestFn = (path: string, init?: RequestInit & { responseType?: 'text' }) => Promise<unknown>;

/** @purpose Observe GitHub Actions runs without exposing mutation methods to Verify. */
export class VcsGithubPipeline extends VcsClientPipeline {
  /**
   * @purpose Bind the authenticated GitHub request transport.
   * @param request Authenticated GitHub API transport with optional text response mode.
   */
  constructor(private readonly request: RequestFn) {
    super();
  }

  /**
   * @purpose Prove that GitHub resolves the requested exact commit identity.
   * @param query Exact project and full commit SHA.
   * @returns Whether GitHub returned the same full SHA.
   */
  async hasCommit(query: VcsPipelineShaQuery): Promise<boolean> {
    try {
      const raw = (await this.request(
        `${this.repo(query.project)}/commits/${encodeURIComponent(query.sha)}`,
        { signal: query.signal }
      )) as { sha?: unknown };
      return raw.sha === query.sha;
    } catch (cause) {
      if (/\b404\b/.test(cause instanceof Error ? cause.message : String(cause))) return false;
      throw cause;
    }
  }

  /**
   * @purpose List only workflow runs returned by GitHub's exact head_sha filter.
   * @param query Exact project and full commit SHA.
   * @returns Bounded complete workflow-run candidates for caller-side exact validation.
   */
  async findPipelinesBySha(query: VcsPipelineShaQuery): Promise<readonly VcsPipelineSummary[]> {
    const result: VcsPipelineSummary[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const raw = (await this.request(
        `${this.repo(query.project)}/actions/runs?head_sha=${encodeURIComponent(query.sha)}&per_page=100&page=${page}`,
        { signal: query.signal }
      )) as { workflow_runs?: unknown; total_count?: unknown };
      if (!Array.isArray(raw.workflow_runs) || !Number.isSafeInteger(raw.total_count)) {
        throw new Error('GitHub workflow run search returned an invalid payload');
      }
      result.push(...raw.workflow_runs.map((value) => this.summary(value)));
      if (result.length >= Number(raw.total_count)) return result;
    }
    throw new Error('GitHub workflow run search exceeded the bounded pagination limit');
  }

  /**
   * @purpose Observe one already-pinned immutable workflow run id.
   * @param query Exact project and immutable run id.
   * @returns Validated run identity and raw status.
   */
  async getPipeline(query: VcsPipelineIdentityQuery): Promise<VcsPipelineSummary> {
    return this.summary(
      await this.request(
        `${this.repo(query.project)}/actions/runs/${encodeURIComponent(query.pipelineId)}`,
        { signal: query.signal }
      )
    );
  }

  /**
   * @purpose Read the bounded complete job set for one pinned workflow run.
   * @param query Exact project and immutable run id.
   * @returns Validated provider jobs from bounded pagination.
   */
  async getPipelineJobs(query: VcsPipelineIdentityQuery): Promise<readonly VcsJob[]> {
    const result: VcsJob[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const raw = (await this.request(
        `${this.repo(query.project)}/actions/runs/${encodeURIComponent(query.pipelineId)}/jobs?per_page=100&page=${page}`,
        { signal: query.signal }
      )) as { jobs?: unknown; total_count?: unknown };
      if (!Array.isArray(raw.jobs) || !Number.isSafeInteger(raw.total_count)) {
        throw new Error('GitHub workflow jobs returned an invalid payload');
      }
      result.push(
        ...raw.jobs.map((value) => {
          const job = value as Record<string, unknown>;
          const conclusion = typeof job.conclusion === 'string' ? job.conclusion : undefined;
          const id = typeof job.id === 'number' || typeof job.id === 'string' ? String(job.id) : '';
          const name = typeof job.name === 'string' ? job.name : '';
          const status = conclusion ?? (typeof job.status === 'string' ? job.status : '');
          if (id === '' || name === '' || status === '') {
            throw new Error('GitHub workflow job endpoint omitted id, name, or status');
          }
          return {
            id,
            name,
            status,
            stage: '',
            ref: String(job.head_sha ?? ''),
            webUrl: String(job.html_url ?? ''),
          };
        })
      );
      if (result.length >= Number(raw.total_count)) return result;
    }
    throw new Error('GitHub workflow jobs exceeded the bounded pagination limit');
  }

  /**
   * @purpose Read one job identity for compatibility with the VCS pipeline port.
   * @param query Exact project and provider job id.
   * @returns Provider job projection.
   */
  async getJob(query: VcsJobQuery): Promise<VcsJob> {
    const raw = (await this.request(
      `${this.repo(query.project)}/actions/jobs/${encodeURIComponent(query.jobId)}`
    )) as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      status: String(raw.conclusion ?? raw.status ?? ''),
      stage: '',
      ref: String(raw.head_sha ?? ''),
      webUrl: String(raw.html_url ?? ''),
    };
  }

  /**
   * @purpose Read failed-job log text without retrying or mutating the run.
   * @param query Exact project and provider job id.
   * @returns Raw log text for bounded downstream redaction.
   */
  async getJobLog(query: VcsJobQuery & { readonly signal?: AbortSignal }): Promise<string> {
    return String(
      await this.request(
        `${this.repo(query.project)}/actions/jobs/${encodeURIComponent(query.jobId)}/logs`,
        { responseType: 'text', signal: query.signal }
      )
    );
  }

  /**
   * @purpose Reject legacy retry mutation on the read-only GitHub adapter.
   * @returns Never; mutation is outside this adapter contract.
   */
  async playJob(): Promise<VcsJob> {
    throw new Error('GitHub pipeline mutation is outside the read-only Verify provider contract');
  }

  /**
   * @purpose Reject legacy cancellation mutation on the read-only GitHub adapter.
   * @returns Never; mutation is outside this adapter contract.
   */
  async cancelJob(): Promise<VcsJob> {
    throw new Error('GitHub pipeline mutation is outside the read-only Verify provider contract');
  }

  /**
   * @purpose Normalize one provider-relative owner/repository API prefix.
   * @param project Provider-relative owner/repository identity.
   * @returns Encoded GitHub repository API prefix.
   */
  private repo(project: string): string {
    const [owner, ...name] = project.split('/');
    if (!owner || name.length === 0) throw new Error('GitHub project must be owner/repository');
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name.join('/'))}`;
  }

  /**
   * @purpose Validate required workflow-run identity without empty-string invention.
   * @param value Untrusted GitHub workflow-run response.
   * @returns Required immutable identity and raw provider status.
   */
  private summary(value: unknown): VcsPipelineSummary {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('GitHub workflow run endpoint returned an invalid payload');
    }
    const raw = value as Record<string, unknown>;
    const id = typeof raw.id === 'number' || typeof raw.id === 'string' ? String(raw.id) : '';
    const sha = typeof raw.head_sha === 'string' ? raw.head_sha : '';
    const status =
      typeof raw.conclusion === 'string'
        ? raw.conclusion
        : typeof raw.status === 'string'
          ? raw.status
          : '';
    const definitionId =
      typeof raw.workflow_id === 'number' || typeof raw.workflow_id === 'string'
        ? String(raw.workflow_id)
        : '';
    const attempt = typeof raw.run_attempt === 'number' ? raw.run_attempt : undefined;
    if (id === '' || sha === '' || status === '' || definitionId === '') {
      throw new Error('GitHub workflow run endpoint omitted id, head_sha, status, or workflow_id');
    }
    return {
      id,
      sha,
      status,
      definitionId,
      ...(attempt === undefined ? {} : { attempt }),
      ...(typeof raw.head_branch === 'string' ? { ref: raw.head_branch } : {}),
      ...(typeof raw.created_at === 'string' ? { createdAt: raw.created_at } : {}),
      ...(typeof raw.updated_at === 'string' ? { updatedAt: raw.updated_at } : {}),
      ...(typeof raw.display_title === 'string' ? { title: raw.display_title } : {}),
    };
  }
}
