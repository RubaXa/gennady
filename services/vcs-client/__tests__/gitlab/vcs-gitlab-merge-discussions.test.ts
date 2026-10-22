// @file: Unit tests for VcsGitlabMergeDiscussions.createDiscussion.
// @spec: VCS-VCS-CLIENT
// @consumers: node:test runner

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
    assert.equal(path, '/projects/g%2Fp/merge_requests/1/discussions');
    assert.strictEqual(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.deepEqual([...new URLSearchParams(String(init.body))], [['body', 'hello']]);
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
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(path, '/projects/g%2Fp/merge_requests/2/discussions');
    assert.strictEqual(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(init.body))), {
      body: 'nit',
      'position[position_type]': 'text',
      'position[base_sha]': 'b',
      'position[start_sha]': 's',
      'position[head_sha]': 'h',
      'position[new_path]': 'src/x.ts',
      'position[new_line]': '42',
      // old_path defaults to new_path when omitted
      'position[old_path]': 'src/x.ts',
    });
  });

  it('keeps a long Unicode comment out of the request URL without losing its bytes', async () => {
    const body = 'Замечание к реализации & проверка + тесты\n'.repeat(1000);
    await disc.createDiscussion({ project: 'g/p', iid: 3, body });
    const [path, init] = requestFn.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(path, '/projects/g%2Fp/merge_requests/3/discussions');
    assert.equal(new URLSearchParams(String(init.body)).get('body'), body);
  });

  it('propagates request errors', async () => {
    requestFn.mock.mockImplementationOnce(async () => {
      throw new Error('GitLab request failed: 403 Forbidden');
    });
    await assert.rejects(() => disc.createDiscussion({ project: 'g/p', iid: 1, body: 'x' }), /403/);
  });
});
