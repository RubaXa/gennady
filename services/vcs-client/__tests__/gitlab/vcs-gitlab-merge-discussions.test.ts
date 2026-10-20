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
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.strictEqual(path, '/projects/g%2Fp/merge_requests/1/discussions');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(
      init.headers?.['Content-Type' as never],
      'application/x-www-form-urlencoded'
    );
    assert.ok(String(init.body).includes('body=hello'));
    assert.ok(!String(path).includes('position'));
  });

  it('posts a line comment with diff position in the body, not the query string', async () => {
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
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.strictEqual(path, '/projects/g%2Fp/merge_requests/2/discussions');
    const body = decodeURIComponent(String(init.body));
    assert.ok(body.includes('position[position_type]=text'));
    assert.ok(body.includes('position[head_sha]=h'));
    assert.ok(body.includes('position[new_path]=src/x.ts'));
    assert.ok(body.includes('position[new_line]=42'));
    // old_path defaults to new_path when omitted
    assert.ok(body.includes('position[old_path]=src/x.ts'));
  });

  it('propagates request errors', async () => {
    requestFn.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab request failed: 403 Forbidden');
    });
    await assert.rejects(() => disc.createDiscussion({ project: 'g/p', iid: 1, body: 'x' }), /403/);
  });
});
