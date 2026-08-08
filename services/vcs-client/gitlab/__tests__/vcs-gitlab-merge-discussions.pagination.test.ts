// @file: Unit tests for VcsGitlabMergeDiscussions#getAll runtime pagination.
// @consumers: node:test runner, inbox-vcs VcsPort adapter
// @tasks: TSK-158

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeDiscussions } from '../vcs-gitlab-merge-discussions.ts';

type DiscussionsPaginationContext = {
  requestFn: ReturnType<typeof mock.fn>;
  discussions: VcsGitlabMergeDiscussions;
};

function createDiscussionsPaginationContext(): DiscussionsPaginationContext {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `discussion-${index + 1}` }));
  const requestFn = mock.fn(async (path: string) =>
    /[?&]page=1(?:&|$)/.test(path) ? firstPage : [{ id: 'discussion-101' }]
  );
  const discussions = new VcsGitlabMergeDiscussions(requestFn);
  return { requestFn, discussions };
}

describe('VcsGitlabMergeDiscussions#getAll', () => {
  it('collects every REST page before returning discussions to inbox-vcs', async () => {
    // contract: a full first page advances to page 2 and preserves every returned discussion
    // failure mode: a single-page adapter would hide threads that determine attention

    const { requestFn, discussions } = createDiscussionsPaginationContext();

    const result = await discussions.getAll({ project: 'group/repo', iid: '42' });

    // #region START_GET_ALL_ASSERT_COMPLETE_PAGE_TRAVERSAL
    assert.strictEqual(result.length, 101);
    assert.strictEqual(requestFn.mock.callCount(), 2);
    assert.match(requestFn.mock.calls[0].arguments[0] as string, /per_page=100.*page=1/);
    assert.match(requestFn.mock.calls[1].arguments[0] as string, /per_page=100.*page=2/);
    // #endregion END_GET_ALL_ASSERT_COMPLETE_PAGE_TRAVERSAL
  });
});
