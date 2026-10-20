// @file: Unit tests for VcsGitlabPipeline — getJob, playJob, retryJob, cancelJob, getJobLog contract.
// @consumers: node:test runner
// @tasks: TSK-84

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabPipeline } from '../vcs-gitlab-pipeline.ts';
import type { VcsJob } from '../../entities/vcs-job.type.ts';

type RequestFn = ReturnType<typeof mock.fn>;

type PipelineContext = {
  requestFn: RequestFn;
  pipeline: VcsGitlabPipeline;
};

type GraphqlFn = ReturnType<typeof mock.fn>;

function createPipelineContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
  graphqlImpl?: () => Promise<unknown>;
}): PipelineContext & { graphqlFn: GraphqlFn } {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const graphqlFn = mock.fn(overrides?.graphqlImpl ?? (async () => ({})));
  const pipeline = new VcsGitlabPipeline(requestFn, graphqlFn);
  return { requestFn, graphqlFn, pipeline };
}

describe('VcsGitlabPipeline', () => {
  it('getJob → 200→VcsJob', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => ({
        id: 9876,
        name: 'lint',
        status: 'success',
        stage: 'test',
        ref: 'main',
        web_url: 'https://gitlab.com/group/repo/-/jobs/9876',
      }),
    });

    const result = await pipeline.getJob({ project: 'group/repo', jobId: '9876' });

    // #region START_GETJOB_HAPPY_ASSERT
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.match(
      requestFn.mock.calls[0].arguments[0] as string,
      /\/projects\/group%2Frepo\/jobs\/9876$/
    );

    assert.deepStrictEqual(result, {
      id: '9876',
      name: 'lint',
      status: 'success',
      stage: 'test',
      ref: 'main',
      webUrl: 'https://gitlab.com/group/repo/-/jobs/9876',
    } satisfies VcsJob);
    // #endregion END_GETJOB_HAPPY_ASSERT
  });

  it('playJob → POST /play', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => ({
        id: 9876,
        name: 'lint',
        status: 'running',
        stage: 'test',
        ref: 'main',
        web_url: 'https://gitlab.com/group/repo/-/jobs/9876',
      }),
    });

    const result = await pipeline.playJob({ project: 'group/repo', jobId: '9876' });

    // #region START_PLAYJOB_ASSERT
    // contract: playJob calls POST /play, returns updated VcsJob
    assert.strictEqual(requestFn.mock.callCount(), 1);
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.match(path, /\/projects\/group%2Frepo\/jobs\/9876\/play$/);
    assert.strictEqual(init.method, 'POST');

    assert.strictEqual(result.status, 'running');
    assert.strictEqual(result.id, '9876');
    assert.strictEqual(result.name, 'lint');
    // #endregion END_PLAYJOB_ASSERT
  });

  it('retryJob → POST /retry', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => ({
        id: 9876,
        name: 'lint',
        status: 'pending',
        stage: 'test',
        ref: 'main',
        web_url: 'https://gitlab.com/group/repo/-/jobs/9876',
      }),
    });

    const result = await pipeline.retryJob({ project: 'group/repo', jobId: '9876' });

    // #region START_RETRYJOB_ASSERT
    // contract: retryJob calls POST /retry, returns updated VcsJob
    assert.strictEqual(requestFn.mock.callCount(), 1);
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.match(path, /\/projects\/group%2Frepo\/jobs\/9876\/retry$/);
    assert.strictEqual(init.method, 'POST');

    assert.strictEqual(result.status, 'pending');
    assert.strictEqual(result.id, '9876');
    assert.strictEqual(result.name, 'lint');
    // #endregion END_RETRYJOB_ASSERT
  });

  it('cancelJob', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => ({
        id: 9876,
        name: 'lint',
        status: 'canceled',
        stage: 'test',
        ref: 'main',
        web_url: 'https://gitlab.com/group/repo/-/jobs/9876',
      }),
    });

    const result = await pipeline.cancelJob({ project: 'group/repo', jobId: '9876' });

    // #region START_CANCELJOB_ASSERT
    // contract: cancelJob calls POST /cancel, returns updated VcsJob
    assert.strictEqual(requestFn.mock.callCount(), 1);
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.match(path, /\/projects\/group%2Frepo\/jobs\/9876\/cancel$/);
    assert.strictEqual(init.method, 'POST');

    assert.strictEqual(result.status, 'canceled');
    assert.strictEqual(result.id, '9876');
    // #endregion END_CANCELJOB_ASSERT
  });

  it('getJobLog → string', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => 'RUNNING: lint job output\nSUCCESS: 0 errors, 0 warnings',
    });

    const result = await pipeline.getJobLog({ project: 'group/repo', jobId: '9876' });

    // #region START_GETJOBLOG_STRING_ASSERT
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.match(
      requestFn.mock.calls[0].arguments[0] as string,
      /\/projects\/group%2Frepo\/jobs\/9876\/trace$/
    );

    assert.strictEqual(result, 'RUNNING: lint job output\nSUCCESS: 0 errors, 0 warnings');
    // #endregion END_GETJOBLOG_STRING_ASSERT
  });

  it('getPipelines → GraphQL summaries, newest first, upper-cased status', async () => {
    const { graphqlFn, pipeline } = createPipelineContext({
      graphqlImpl: async () => ({
        project: {
          pipelines: {
            nodes: [
              {
                id: 'gid://gitlab/Ci::Pipeline/49359152',
                iid: '3448',
                sha: '104475222d55a8e2e5785fcd7b9abc46aa9ef7d5',
                ref: 'master',
                status: 'running',
                createdAt: '2026-09-16T17:04:33Z',
                updatedAt: '2026-09-16T17:04:37Z',
                commit: { title: "Merge branch 'x' into 'master'" },
              },
              null,
            ],
          },
        },
      }),
    });

    const result = await pipeline.getPipelines({
      project: 'mail/messenger',
      ref: 'master',
      limit: 2,
    });

    // #region START_GETPIPELINES_ASSERT
    const [query, variables] = graphqlFn.mock.calls[0].arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.match(query, /pipelines\(ref: \$ref, sha: \$sha, first: \$first\)/);
    assert.deepStrictEqual(variables, {
      project: 'mail/messenger',
      ref: 'master',
      sha: null,
      first: 2,
    });

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], {
      id: '49359152',
      iid: '3448',
      status: 'RUNNING',
      sha: '104475222d55a8e2e5785fcd7b9abc46aa9ef7d5',
      ref: 'master',
      createdAt: '2026-09-16T17:04:33Z',
      updatedAt: '2026-09-16T17:04:37Z',
      title: "Merge branch 'x' into 'master'",
    });
    // #endregion END_GETPIPELINES_ASSERT
  });

  it('getPipelineJobs → job list for a concrete pipeline iid', async () => {
    const { graphqlFn, pipeline } = createPipelineContext({
      graphqlImpl: async () => ({
        project: {
          pipeline: {
            jobs: {
              nodes: [
                { id: 'gid://gitlab/Ci::Build/375461915', name: 'mc:jest', status: 'FAILED' },
                { id: 'gid://gitlab/Ci::Build/375461917', name: 'mc:validate', status: 'SUCCESS' },
              ],
            },
          },
        },
      }),
    });

    const result = await pipeline.getPipelineJobs({
      project: 'mail/messenger',
      pipelineId: '3407',
    });

    // #region START_GETPIPELINEJOBS_ASSERT
    const [query, variables] = graphqlFn.mock.calls[0].arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.match(query, /pipeline\(iid: \$iid\) \{ jobs \{ nodes \{ id name status \} \} \}/);
    assert.deepStrictEqual(variables, { project: 'mail/messenger', iid: '3407' });

    assert.deepStrictEqual(result, [
      { id: 'gid://gitlab/Ci::Build/375461915', name: 'mc:jest', status: 'FAILED' },
      { id: 'gid://gitlab/Ci::Build/375461917', name: 'mc:validate', status: 'SUCCESS' },
    ]);
    // #endregion END_GETPIPELINEJOBS_ASSERT
  });

  it('getPipelines throws when GraphQL transport is not configured', async () => {
    const requestFn = mock.fn(async () => ({}));
    const pipeline = new VcsGitlabPipeline(requestFn);

    await assert.rejects(
      () => pipeline.getPipelines({ project: 'group/repo' }),
      /GraphQL transport not configured/
    );
  });

  it('getJob maps missing fields to empty strings', async () => {
    const { requestFn, pipeline } = createPipelineContext({
      requestImpl: async () => ({}),
    });

    const result = await pipeline.getJob({ project: 'group/repo', jobId: '1' });

    // #region START_GETJOB_EMPTY_FIELDS_ASSERT
    // contract: missing API fields default to '' — no undefined/null in VcsJob
    assert.deepStrictEqual(result, {
      id: '',
      name: '',
      status: '',
      stage: '',
      ref: '',
      webUrl: '',
    } satisfies VcsJob);
    // #endregion END_GETJOB_EMPTY_FIELDS_ASSERT
  });
});
