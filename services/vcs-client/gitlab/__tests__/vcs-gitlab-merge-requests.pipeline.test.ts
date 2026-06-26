// @file: Unit tests for VcsGitlabMergeRequests.getPipeline — happy path, absent pipeline, type contract, missing graphql transport.
// @consumers: node:test runner
// @tasks: TSK-82

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeRequests } from '../vcs-gitlab-merge-requests.ts';
import type { VcsPipeline } from '../../entities/vcs-pipeline.type.ts';
import type { VcsPipelineQuery } from '../../abstract/vcs-client-merge-requests.ts';

type GraphqlFn = ReturnType<typeof mock.fn>;

type PipelineContext = {
  graphqlFn: GraphqlFn;
  mr: VcsGitlabMergeRequests;
};

function createPipelineContext(overrides?: {
  graphqlImpl?: () => Promise<unknown>;
}): PipelineContext {
  const requestFn = mock.fn(async () => ({}));
  const graphqlFn = mock.fn(overrides?.graphqlImpl ?? (async () => ({})));
  const mr = new VcsGitlabMergeRequests(requestFn, graphqlFn);
  return { graphqlFn, mr };
}

describe('VcsGitlabMergeRequests — getPipeline', () => {
  it('returns pipeline status and jobs from GraphQL headPipeline query', async () => {
    const { graphqlFn, mr } = createPipelineContext({
      graphqlImpl: async () => ({
        project: {
          mergeRequest: {
            headPipeline: {
              status: 'success',
              jobs: {
                nodes: [
                  { name: 'lint', status: 'success' },
                  { name: 'test', status: 'failed' },
                ],
              },
            },
          },
        },
      }),
    });

    const result = await mr.getPipeline({ project: 'group/repo', iid: 42 });

    // #region START_PIPELINE_HAPPY_ASSERT_INTERACTIONS
    assert.strictEqual(graphqlFn.mock.callCount(), 1);
    assert.match(graphqlFn.mock.calls[0].arguments[0] as string, /headPipeline/);
    assert.deepStrictEqual(graphqlFn.mock.calls[0].arguments[1], {
      project: 'group/repo',
      iid: '42',
    });

    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.jobs.length, 2);
    assert.deepStrictEqual(result.jobs[0], { name: 'lint', status: 'success' });
    assert.deepStrictEqual(result.jobs[1], { name: 'test', status: 'failed' });
    // #endregion END_PIPELINE_HAPPY_ASSERT_INTERACTIONS
  });

  it('returns empty status and empty jobs when headPipeline is absent', async () => {
    const { mr } = createPipelineContext({
      graphqlImpl: async () => ({
        project: {
          mergeRequest: {
            headPipeline: null,
          },
        },
      }),
    });

    const result = await mr.getPipeline({ project: 'group/repo', iid: 1 });

    // #region START_ABSENT_PIPELINE_ASSERT_EMPTY
    // contract: pipeline absence returns empty result, not null, per P1 decision pipeline-absence=empty-result
    assert.strictEqual(result.status, '');
    assert.strictEqual(result.jobs.length, 0);
    // #endregion END_ABSENT_PIPELINE_ASSERT_EMPTY
  });

  it('throws when GraphQL transport is not configured', async () => {
    const requestFn = mock.fn(async () => ({}));
    const mr = new VcsGitlabMergeRequests(requestFn);

    await assert.rejects(
      () => mr.getPipeline({ project: 'group/repo', iid: 42 }),
      (error: unknown) => {
        assert.match((error as Error).message, /GraphQL transport not configured/);
        return true;
      }
    );
  });

  it('satisfies VcsPipeline type contract', () => {
    // #region START_TYPE_CONTRACT_ASSERT_SHAPE
    // contract: VcsPipeline.status: string, jobs: {name, status}[]
    const pipeline: VcsPipeline = { status: 'running', jobs: [] };
    assert.strictEqual(typeof pipeline.status, 'string');
    assert.ok(Array.isArray(pipeline.jobs));

    pipeline.jobs = [{ name: 'build', status: 'pending' }];
    assert.strictEqual(typeof pipeline.jobs[0].name, 'string');
    assert.strictEqual(typeof pipeline.jobs[0].status, 'string');
    // #endregion END_TYPE_CONTRACT_ASSERT_SHAPE
  });
});
