// @file: Unit tests for VcsGitlabPipeline — getJob, playJob, cancelJob, getJobLog contract.
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

function createPipelineContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
}): PipelineContext {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const pipeline = new VcsGitlabPipeline(requestFn);
  return { requestFn, pipeline };
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

  it('playJob → retry alias', async () => {
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

    // #region START_PLAYJOB_RETRY_ALIAS_ASSERT
    // contract: playJob is a retry alias — POST /play, returns updated VcsJob
    assert.strictEqual(requestFn.mock.callCount(), 1);
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.match(path, /\/projects\/group%2Frepo\/jobs\/9876\/play$/);
    assert.strictEqual(init.method, 'POST');

    assert.strictEqual(result.status, 'running');
    assert.strictEqual(result.id, '9876');
    assert.strictEqual(result.name, 'lint');
    // #endregion END_PLAYJOB_RETRY_ALIAS_ASSERT
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
