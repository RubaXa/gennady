// @file: Unit tests for VcsGitlabMergeDiscussions.resolveDiscussion — resolve, reopen, 403/404/500 errors, type contract.
// @consumers: node:test runner
// @tasks: TSK-71

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeDiscussions } from '../vcs-gitlab-merge-discussions.ts';
import type { VcsResolveDiscussionQuery } from '../../entities/vcs-resolve-discussion-query.type.ts';

type RequestFn = ReturnType<typeof mock.fn>;

type ResolveDiscussionContext = {
  requestFn: RequestFn;
  discussions: VcsGitlabMergeDiscussions;
};

function createResolveDiscussionContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
}): ResolveDiscussionContext {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const discussions = new VcsGitlabMergeDiscussions(requestFn);
  return { requestFn, discussions };
}

describe('VcsGitlabMergeDiscussions — resolveDiscussion', () => {
  it('resolveDiscussion resolved=true — PUT success', async () => {
    const { requestFn, discussions } = createResolveDiscussionContext();

    await discussions.resolveDiscussion({
      project: 'group/repo',
      iid: 42,
      discussionId: 'disc-1',
      resolved: true,
    });

    // #region START_RESOLVE_SUCCESS_ASSERT_URL
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/discussions/disc-1?resolved=true'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'PUT' });
    // #endregion END_RESOLVE_SUCCESS_ASSERT_URL
  });

  it('resolveDiscussion resolved=false — reopen', async () => {
    const { requestFn, discussions } = createResolveDiscussionContext();

    await discussions.resolveDiscussion({
      project: 'g/r',
      iid: 1,
      discussionId: 'n123',
      resolved: false,
    });

    // #region START_REOPEN_ASSERT_URL
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/g%2Fr/merge_requests/1/discussions/n123?resolved=false'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'PUT' });
    // #endregion END_REOPEN_ASSERT_URL
  });

  it('VcsResolveDiscussionQuery type contract', () => {
    // contract: all fields required — project, iid, discussionId, resolved
    // failure mode: do NOT accept partial shape; TypeScript must reject missing resolved

    const query: VcsResolveDiscussionQuery = {
      project: 'g/r',
      iid: 42,
      discussionId: 'abc',
      resolved: true,
    };

    // #region START_TYPE_CONTRACT_ASSERT_SHAPE
    assert.strictEqual(typeof query.project, 'string');
    assert.strictEqual(typeof query.iid, 'number');
    assert.strictEqual(typeof query.discussionId, 'string');
    assert.strictEqual(typeof query.resolved, 'boolean');
    // #endregion END_TYPE_CONTRACT_ASSERT_SHAPE
  });

  // @ts-expect-error — resolved is required; missing field must fail compile
  const _compileCheck: VcsResolveDiscussionQuery = {
    project: 'g/r',
    iid: 42,
    discussionId: 'abc',
  };

  it('resolveDiscussion 403/404 — VcsError', async () => {
    // contract: GitLab 403 or 404 HTTP response propagates as Error with status in message
    // failure mode: do NOT swallow the error silently

    const { discussions } = createResolveDiscussionContext({
      requestImpl: async () => {
        throw new Error('GitLab request failed: 403 Forbidden ');
      },
    });

    await assert.rejects(
      () =>
        discussions.resolveDiscussion({
          project: 'g/r',
          iid: 42,
          discussionId: 'abc',
          resolved: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /403/);
        return true;
      }
    );
  });

  it('resolveDiscussion 500 — VcsError', async () => {
    // contract: GitLab 500 Internal Server Error propagates as Error with status in message
    // failure mode: do NOT retry or wrap into a different error class

    const { discussions } = createResolveDiscussionContext({
      requestImpl: async () => {
        throw new Error('GitLab request failed: 500 Internal Server Error ');
      },
    });

    await assert.rejects(
      () =>
        discussions.resolveDiscussion({
          project: 'g/r',
          iid: 42,
          discussionId: 'abc',
          resolved: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /500/);
        return true;
      }
    );
  });
});
