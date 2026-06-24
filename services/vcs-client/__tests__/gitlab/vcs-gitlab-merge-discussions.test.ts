// @file: Unit tests for VcsGitlabMergeDiscussions.createDiscussion.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeDiscussions } from '../../gitlab/vcs-gitlab-merge-discussions.ts';

describe('VcsGitlabMergeDiscussions — createDiscussion', () => {
  let requestFn: ReturnType<typeof mock.fn>;
  let disc: VcsGitlabMergeDiscussions;

  beforeEach(() => {
    requestFn = mock.fn(async () => ({ id: 'NEW' }));
    disc = new VcsGitlabMergeDiscussions(requestFn);
  });

  it('posts a general discussion with only a body', async () => {
    await disc.createDiscussion({ project: 'g/p', iid: 1, body: 'hello' });
    const [path, init] = requestFn.mock.calls[0].arguments as [string, { method?: string }];
    assert.ok(path.startsWith('/projects/g%2Fp/merge_requests/1/discussions?'));
    assert.strictEqual(init.method, 'POST');
    assert.ok(decodeURIComponent(path).includes('body=hello'));
    assert.ok(!path.includes('position'));
  });

  it('posts a line comment with diff position', async () => {
    await disc.createDiscussion({
      project: 'g/p',
      iid: 2,
      body: 'nit',
      position: {
        baseSha: 'b',
        startSha: 's',
        headSha: 'h',
        newPath: 'src/x.ts',
        newLine: 42,
      },
    });
    const path = decodeURIComponent(requestFn.mock.calls[0].arguments[0] as string);
    assert.ok(path.includes('position[position_type]=text'));
    assert.ok(path.includes('position[head_sha]=h'));
    assert.ok(path.includes('position[new_path]=src/x.ts'));
    assert.ok(path.includes('position[new_line]=42'));
    // old_path defaults to new_path when omitted
    assert.ok(path.includes('position[old_path]=src/x.ts'));
  });

  it('propagates request errors', async () => {
    requestFn.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab request failed: 403 Forbidden');
    });
    await assert.rejects(
      () => disc.createDiscussion({ project: 'g/p', iid: 1, body: 'x' }),
      /403/
    );
  });
});
