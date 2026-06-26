// @file: Unit tests for VcsGitlabMergeRequests.approve — success, idempotent, forbidden, conflict, type contract.
// @consumers: node:test runner
// @tasks: TSK-67

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeRequests, VcsApproveError } from '../vcs-gitlab-merge-requests.ts';
import type { VcsMergeRequestApproveQuery } from '../../entities/vcs-merge-request-approve-query.type.ts';

type RequestFn = ReturnType<typeof mock.fn>;

type ApproveContext = {
  requestFn: RequestFn;
  mr: VcsGitlabMergeRequests;
};

function createApproveContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
}): ApproveContext {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const mr = new VcsGitlabMergeRequests(requestFn);
  return { requestFn, mr };
}

describe('VcsGitlabMergeRequests — approve', () => {
  it('approve success — POST with correct URL and token', async () => {
    const { requestFn, mr } = createApproveContext();

    await mr.approve({ repository: 'group/repo', iid: 42 });

    // #region START_APPROVE_SUCCESS_ASSERT_INTERACTIONS
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/approve'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'POST' });
    // #endregion END_APPROVE_SUCCESS_ASSERT_INTERACTIONS
  });

  it('approve 409 ALREADY_APPROVED — idempotent error', async () => {
    const { mr } = createApproveContext({
      requestImpl: async () => {
        throw new Error('HTTP 409: Merge request is already approved');
      },
    });

    await assert.rejects(
      () => mr.approve({ repository: 'group/repo', iid: 42 }),
      (error: unknown) => {
        assert.ok(error instanceof VcsApproveError);
        assert.strictEqual((error as VcsApproveError).code, 'ALREADY_APPROVED');
        assert.match((error as Error).message, /already approved/);
        return true;
      }
    );
  });

  it('approve 403 SELF_APPROVE_FORBIDDEN', async () => {
    const { mr } = createApproveContext({
      requestImpl: async () => {
        throw new Error(
          'HTTP 403: You cannot approve this merge request because it belongs to its author'
        );
      },
    });

    await assert.rejects(
      () => mr.approve({ repository: 'group/repo', iid: 42 }),
      (error: unknown) => {
        assert.ok(error instanceof VcsApproveError);
        assert.strictEqual((error as VcsApproveError).code, 'SELF_APPROVE_FORBIDDEN');
        assert.match((error as Error).message, /its author/);
        return true;
      }
    );
  });

  it('approve 409 CANNOT_APPROVE — conflict error', async () => {
    const { mr } = createApproveContext({
      requestImpl: async () => {
        throw new Error('HTTP 409: Merge request cannot be approved due to conflicts');
      },
    });

    await assert.rejects(
      () => mr.approve({ repository: 'group/repo', iid: 42 }),
      (error: unknown) => {
        assert.ok(error instanceof VcsApproveError);
        assert.strictEqual((error as VcsApproveError).code, 'CANNOT_APPROVE');
        assert.match((error as Error).message, /cannot be approved/);
        return true;
      }
    );
  });

  it('VcsMergeRequestApproveQuery type contract', () => {
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
