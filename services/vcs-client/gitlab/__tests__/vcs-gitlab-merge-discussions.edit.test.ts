// @file: Unit tests for VcsGitlabMergeDiscussions.{updateNote,deleteNote} — happy path, ownership guard, 404 propagation.
// @consumers: node:test runner
// @tasks: TSK-77

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeDiscussions } from '../vcs-gitlab-merge-discussions.ts';
import type { VcsUpdateNoteQuery } from '../../entities/vcs-update-note-query.type.ts';
import type { VcsDeleteNoteQuery } from '../../entities/vcs-delete-note-query.type.ts';

type EditNoteContext = {
  requestFn: ReturnType<typeof mock.fn>;
  discussions: VcsGitlabMergeDiscussions;
};

function createEditNoteContext(overrides?: {
  noteAuthor?: string;
  currentUser?: string;
}): EditNoteContext {
  const noteAuthor = overrides?.noteAuthor ?? 'me';
  const currentUser = overrides?.currentUser ?? 'me';
  let callIdx = 0;
  const requestFn = mock.fn(async () => {
    callIdx++;
    if (callIdx === 1) return { author: { username: noteAuthor } };
    if (callIdx === 2) return { username: currentUser };
    return undefined;
  });
  const discussions = new VcsGitlabMergeDiscussions(requestFn);
  return { requestFn, discussions };
}

describe('VcsGitlabMergeDiscussions — updateNote / deleteNote', () => {
  it('updateNote should PUT updated body after ownership check', async () => {
    const { requestFn, discussions } = createEditNoteContext();

    await discussions.updateNote({
      project: 'group/repo',
      iid: 42,
      noteId: 17,
      body: 'updated text',
    });

    // #region START_UPDATE_NOTE_ASSERT_CALLS
    assert.strictEqual(requestFn.mock.callCount(), 3);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/notes/17'
    );
    assert.strictEqual(requestFn.mock.calls[1].arguments[0], '/user');
    assert.strictEqual(
      requestFn.mock.calls[2].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/notes/17'
    );
    assert.deepStrictEqual(requestFn.mock.calls[2].arguments[1], {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'updated text' }),
    });
    // #endregion END_UPDATE_NOTE_ASSERT_CALLS
  });

  it('deleteNote should DELETE note after ownership check', async () => {
    const { requestFn, discussions } = createEditNoteContext();

    await discussions.deleteNote({
      project: 'ns/proj',
      iid: '7',
      noteId: '99',
    });

    // #region START_DELETE_NOTE_ASSERT_CALLS
    assert.strictEqual(requestFn.mock.callCount(), 3);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/ns%2Fproj/merge_requests/7/notes/99'
    );
    assert.strictEqual(requestFn.mock.calls[1].arguments[0], '/user');
    assert.strictEqual(
      requestFn.mock.calls[2].arguments[0],
      '/projects/ns%2Fproj/merge_requests/7/notes/99'
    );
    assert.deepStrictEqual(requestFn.mock.calls[2].arguments[1], { method: 'DELETE' });
    // #endregion END_DELETE_NOTE_ASSERT_CALLS
  });

  it('updateNote should reject when note author does not match current user', async () => {
    // contract: _verifyNoteOwnership compares note.author.username against /user.username
    // failure mode: do NOT assert the full error message — it carries dynamic project/id values

    const { discussions } = createEditNoteContext({
      noteAuthor: 'colleague',
      currentUser: 'me',
    });

    await assert.rejects(
      () =>
        discussions.updateNote({
          project: 'g/r',
          iid: 1,
          noteId: 5,
          body: 'nope',
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /Cannot modify another user's note/);
        return true;
      }
    );
  });

  it('updateNote should propagate 404 as Error', async () => {
    // contract: network error from _verifyNoteOwnership or PUT propagates outward
    // failure mode: do NOT wrap 404 into a different error class silently

    const requestFn = mock.fn(async () => {
      throw new Error('GitLab request failed: 404 Not Found ');
    });
    const discussions = new VcsGitlabMergeDiscussions(requestFn);

    await assert.rejects(
      () =>
        discussions.updateNote({
          project: 'g/r',
          iid: 1,
          noteId: 5,
          body: 'body',
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /404/);
        return true;
      }
    );
  });

  // @ts-expect-error — body is required for updateNote; missing must fail compile
  const _updateCheck: VcsUpdateNoteQuery = {
    project: 'g/r',
    iid: 42,
    noteId: 1,
  };

  // @ts-expect-error — noteId is required for deleteNote; missing must fail compile
  const _deleteCheck: VcsDeleteNoteQuery = {
    project: 'g/r',
    iid: 42,
  };
});
