// @file: Dedicated GitLab approval and complete commit-comparison endpoint contract tests.
// @consumers: node:test runner
// @tasks: TSK-174

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabClient } from '../../gitlab/vcs-gitlab-client.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('VcsGitlabClient observation endpoints', () => {
  it('reads approvers from the dedicated approvals endpoint', async () => {
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      assert.strictEqual(
        String(url),
        'https://gitlab.example.com/api/v4/projects/group%2Fproject/merge_requests/42/approvals'
      );
      return new Response(
        JSON.stringify({
          approved_by: [{ user: { username: 'alice' } }, { user: { username: 'bob' } }],
          approvals_required: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const client = new VcsGitlabClient({
      baseUrl: 'https://gitlab.example.com/api/v4',
      token: 'test-token',
    });

    assert.deepStrictEqual(await client.getMergeRequestApprovals('group/project', '42'), {
      approvedBy: ['alice', 'bob'],
      approvalsRequired: 2,
      complete: true,
    });
  });

  it('returns the full ordered commit range and marks provider truncation incomplete', async () => {
    const payloads = [
      { commits: [{ id: 'sha-2' }, { id: 'sha-3' }] },
      { commits: [{ id: 'sha-2' }], compare_timeout: true },
    ];
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      assert.strictEqual(parsed.pathname, '/api/v4/projects/group%2Fproject/repository/compare');
      assert.strictEqual(parsed.searchParams.get('from'), 'sha-1');
      assert.strictEqual(parsed.searchParams.get('to'), 'sha-3');
      assert.strictEqual(parsed.searchParams.get('straight'), 'true');
      return new Response(JSON.stringify(payloads.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const client = new VcsGitlabClient({
      baseUrl: 'https://gitlab.example.com/api/v4',
      token: 'test-token',
    });

    assert.deepStrictEqual(
      await client.compareMergeRequestCommits('group/project', 'sha-1', 'sha-3'),
      {
        commits: ['sha-2', 'sha-3'],
        complete: true,
        evidence: 'gitlab-repository-compare-complete',
      }
    );
    assert.deepStrictEqual(
      await client.compareMergeRequestCommits('group/project', 'sha-1', 'sha-3'),
      {
        commits: ['sha-2'],
        complete: false,
        evidence: 'gitlab-repository-compare-timeout',
      }
    );
  });

  it('sends a discussion body in the request body, not the query string', async () => {
    const longBody = 'Русский комментарий '.repeat(200);
    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      assert.strictEqual(
        parsed.pathname,
        '/api/v4/projects/group%2Fproject/merge_requests/7/discussions'
      );
      assert.strictEqual(parsed.search, '');
      assert.strictEqual(init?.method, 'POST');
      const sent = new URLSearchParams(String(init?.body));
      assert.strictEqual(sent.get('body'), longBody);
      return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const client = new VcsGitlabClient({
      baseUrl: 'https://gitlab.example.com/api/v4',
      token: 'test-token',
    });

    await client.MergeDiscussions.createDiscussion({
      project: 'group/project',
      iid: 7,
      body: longBody,
    });
    assert.strictEqual(
      (globalThis.fetch as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
      1
    );
  });

  it('treats an empty 204 response as success without parsing JSON', async () => {
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      assert.strictEqual(init?.method, 'PUT');
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const client = new VcsGitlabClient({
      baseUrl: 'https://gitlab.example.com/api/v4',
      token: 'test-token',
    });

    assert.strictEqual(
      await client.MergeDiscussions.publishDraftNote({
        project: 'group/project',
        iid: 7,
        draftNoteId: 99,
      }),
      undefined
    );
  });
});
