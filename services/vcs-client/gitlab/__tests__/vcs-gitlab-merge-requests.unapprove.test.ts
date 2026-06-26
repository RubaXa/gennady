// @file: Unit tests for VcsGitlabMergeRequests.unapprove — success, idempotent 409, 403 error, type contract.
// @consumers: node:test runner
// @tasks: TSK-73

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeRequests } from '../vcs-gitlab-merge-requests.ts';
import type { VcsMergeRequestApproveQuery } from '../../entities/vcs-merge-request-approve-query.type.ts';

type RequestFn = ReturnType<typeof mock.fn>;

type UnapproveContext = {
  requestFn: RequestFn;
  mr: VcsGitlabMergeRequests;
};

function createUnapproveContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
}): UnapproveContext {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const mr = new VcsGitlabMergeRequests(requestFn);
  return { requestFn, mr };
}

describe('VcsGitlabMergeRequests — unapprove', () => {
  it('unapprove success — POST with correct URL', async () => {
    const { requestFn, mr } = createUnapproveContext();

    await mr.unapprove({ repository: 'group/repo', iid: 42 });

    // #region START_UNAPPROVE_SUCCESS_ASSERT_INTERACTIONS
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/unapprove'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'POST' });
    // #endregion END_UNAPPROVE_SUCCESS_ASSERT_INTERACTIONS
  });

  it('unapprove 409 Not Approved — idempotent (resolves silently)', async () => {
    // contract: 409 is not a failure — desired state is already achieved; unapprove returns void
    // failure mode: do NOT assert on log output — log is infrastructure, not contract surface

    const { mr } = createUnapproveContext({
      requestImpl: async () => {
        throw new Error('HTTP 409: Merge request is not approved');
      },
    });

    await mr.unapprove({ repository: 'group/repo', iid: 42 });
  });

  it('unapprove 403 self-unapprove forbidden — error thrown', async () => {
    const { mr } = createUnapproveContext({
      requestImpl: async () => {
        throw new Error(
          'HTTP 403: You cannot unapprove this merge request because it belongs to its author'
        );
      },
    });

    await assert.rejects(
      () => mr.unapprove({ repository: 'group/repo', iid: 42 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /its author/);
        return true;
      }
    );
  });

  it('VcsMergeRequestApproveQuery type contract — reused for unapprove', () => {
    const query: VcsMergeRequestApproveQuery = {
      repository: 'g/r',
      iid: 42,
    };

    // #region START_TYPE_CONTRACT_ASSERT_SHAPE
    assert.strictEqual(typeof query.repository, 'string');
    assert.strictEqual(typeof query.iid, 'number');
    // #endregion END_TYPE_CONTRACT_ASSERT_SHAPE
  });
});
