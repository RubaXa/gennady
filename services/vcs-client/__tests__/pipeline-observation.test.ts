// @file: GitLab/GitHub exact-SHA read-only pipeline provider contract tests.
// @spec: CLI-VERIFY
// @consumers: remote Verify watcher

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { watchRemotePipeline } from '../../../shared/verify/execution/remote-watcher.ts';
import { VcsGithubPipeline } from '../github/vcs-github-pipeline.ts';
import { VcsGitlabPipeline } from '../gitlab/vcs-gitlab-pipeline.ts';

const SHA = 'a'.repeat(40);

describe('read-only pipeline observation providers', () => {
  it('GitLab queries only the exact SHA then observes the pinned numeric id', async () => {
    const request = mock.fn(async (path: string) => {
      if (path.includes('/repository/commits/')) return { id: SHA };
      if (path.includes('/pipelines?')) {
        return [{ id: 44, sha: SHA, status: 'running', source: 'push' }];
      }
      if (path.endsWith('/pipelines/44')) {
        return { id: 44, sha: SHA, status: 'success', source: 'push' };
      }
      if (path.includes('/pipelines/44/jobs')) return [];
      throw new Error(`unexpected ${path}`);
    });
    const provider = new VcsGitlabPipeline(request);
    assert.equal(await provider.hasCommit({ project: 'group/repo', sha: SHA }), true);
    assert.deepEqual(await provider.findPipelinesBySha({ project: 'group/repo', sha: SHA }), [
      { definitionId: 'source:push', id: '44', sha: SHA, status: 'running' },
    ]);
    assert.equal(
      (await provider.getPipeline({ project: 'group/repo', pipelineId: '44' })).status,
      'success'
    );
    await provider.getPipelineJobs({ project: 'group/repo', pipelineId: '44' });
    assert.match(request.mock.calls[1]!.arguments[0], new RegExp(`sha=${SHA}`));
    assert.doesNotMatch(request.mock.calls[1]!.arguments[0], /latest/i);
    assert.match(request.mock.calls[2]!.arguments[0], /\/pipelines\/44$/);
  });

  it('GitHub queries head_sha and pins one workflow run id', async () => {
    const request = mock.fn(async (path: string) => {
      if (path.includes('/commits/')) return { sha: SHA };
      if (path.includes('/actions/runs?')) {
        return {
          total_count: 1,
          workflow_runs: [
            { id: 55, head_sha: SHA, status: 'in_progress', workflow_id: 7, run_attempt: 1 },
          ],
        };
      }
      if (path.endsWith('/actions/runs/55')) {
        return { id: 55, head_sha: SHA, conclusion: 'success', workflow_id: 7, run_attempt: 1 };
      }
      if (path.includes('/actions/runs/55/jobs')) return { total_count: 0, jobs: [] };
      throw new Error(`unexpected ${path}`);
    });
    const provider = new VcsGithubPipeline(request);
    assert.equal(await provider.hasCommit({ project: 'owner/repo', sha: SHA }), true);
    assert.equal(
      (await provider.findPipelinesBySha({ project: 'owner/repo', sha: SHA }))[0]?.id,
      '55'
    );
    assert.equal(
      (await provider.getPipeline({ project: 'owner/repo', pipelineId: '55' })).status,
      'success'
    );
    assert.match(request.mock.calls[1]!.arguments[0], new RegExp(`head_sha=${SHA}`));
    assert.match(request.mock.calls[2]!.arguments[0], /\/actions\/runs\/55$/);
  });

  it('collects bounded failed-job logs for a failed GitHub workflow', async () => {
    const request = mock.fn(async (path: string) => {
      if (path.includes('/commits/')) return { sha: SHA };
      if (path.includes('/actions/runs?')) {
        return {
          total_count: 1,
          workflow_runs: [
            {
              id: 55,
              head_sha: SHA,
              conclusion: 'failure',
              workflow_id: 7,
              run_attempt: 2,
            },
          ],
        };
      }
      if (path.includes('/actions/runs/55/jobs')) {
        return {
          total_count: 1,
          jobs: [{ id: 9, name: 'unit', conclusion: 'failure' }],
        };
      }
      if (path.endsWith('/actions/jobs/9/logs')) return 'failure detail';
      throw new Error(`unexpected ${path}`);
    });
    const provider = new VcsGithubPipeline(request);
    const result = await watchRemotePipeline({
      observer: { provider: 'github', project: 'owner/repo', pipeline: provider },
      sourceSha: SHA,
      timeoutMs: 1_000,
      pollIntervalMs: 100,
    });
    assert.equal(result.state, 'REMOTE_FAILED');
    assert.equal(result.proof?.definitionId, '7');
    assert.equal(result.proof?.jobs[0]?.logIdentity?.startsWith('sha256:'), true);
    assert.match(
      result.evidence.find((entry) => entry.kind === 'log')?.summary ?? '',
      /failure detail/
    );
    assert.ok(
      request.mock.calls.some((call) => call.arguments[0].endsWith('/actions/jobs/9/logs'))
    );
  });

  it('fails closed when identity fields are omitted instead of normalizing to empty strings', async () => {
    const provider = new VcsGitlabPipeline(async () => [{ status: 'success' }]);
    await assert.rejects(
      provider.findPipelinesBySha({ project: 'group/repo', sha: SHA }),
      /omitted id, sha, status, or source/
    );
  });
});
