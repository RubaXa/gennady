// @file: Unit tests for VcsGitlabMergeDiscussions — deleteDiscussion, createDraftNote, updateDraftNote, deleteDraftNote, publishDraftNote.
// @consumers: node:test runner
// @tasks: TSK-86

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VcsGitlabMergeDiscussions } from '../vcs-gitlab-merge-discussions.ts';
import type { VcsDraftNote } from '../../entities/vcs-draft-note.type.ts';
import type { VcsCreateDraftNoteQuery } from '../../abstract/vcs-client-merge-discussions.ts';

type RequestFn = ReturnType<typeof mock.fn>;

type DraftNoteContext = {
  requestFn: RequestFn;
  discussions: VcsGitlabMergeDiscussions;
};

function createDraftNoteContext(overrides?: {
  requestImpl?: () => Promise<unknown>;
}): DraftNoteContext {
  const requestFn = mock.fn(overrides?.requestImpl ?? (async () => ({})));
  const discussions = new VcsGitlabMergeDiscussions(requestFn);
  return { requestFn, discussions };
}

describe('VcsGitlabMergeDiscussions — deleteDiscussion / draft notes', () => {
  it('deleteDiscussion should send DELETE to correct URL and resolve void', async () => {
    const { requestFn, discussions } = createDraftNoteContext();

    await discussions.deleteDiscussion({
      project: 'group/repo',
      iid: 42,
      discussionId: 'disc-1',
    });

    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/discussions/disc-1'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'DELETE' });
  });

  it('createDraftNote should send POST with body and return VcsDraftNote', async () => {
    const expected: VcsDraftNote = { id: '10', body: 'draft body', author: 'me' };
    const { requestFn, discussions } = createDraftNoteContext({
      requestImpl: async () => expected,
    });

    const result = await discussions.createDraftNote({
      project: 'group/repo',
      iid: 42,
      body: 'draft body',
    });

    // #region START_CREATE_DRAFT_NOTE_ASSERT_CALLS
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/draft_notes'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'draft body' }),
    });
    assert.deepStrictEqual(result, expected);
    // #endregion END_CREATE_DRAFT_NOTE_ASSERT_CALLS
  });

  it('createDraftNote should include position in request body when given', async () => {
    const { requestFn, discussions } = createDraftNoteContext();

    await discussions.createDraftNote({
      project: 'group/repo',
      iid: 42,
      body: 'line comment',
      position: {
        baseSha: 'abc',
        startSha: 'def',
        headSha: 'ghi',
        newPath: 'src/file.ts',
        newLine: 15,
      },
    });

    // #region START_CREATE_DRAFT_WITH_POSITION_ASSERT
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/draft_notes'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: 'line comment',
        position: {
          baseSha: 'abc',
          startSha: 'def',
          headSha: 'ghi',
          newPath: 'src/file.ts',
          newLine: 15,
        },
      }),
    });
    // #endregion END_CREATE_DRAFT_WITH_POSITION_ASSERT
  });

  it('updateDraftNote should send PUT with body and return VcsDraftNote', async () => {
    const expected: VcsDraftNote = { id: '10', body: 'updated body', author: 'me' };
    const { requestFn, discussions } = createDraftNoteContext({
      requestImpl: async () => expected,
    });

    const result = await discussions.updateDraftNote({
      project: 'group/repo',
      iid: 42,
      draftNoteId: 10,
      body: 'updated body',
    });

    // #region START_UPDATE_DRAFT_NOTE_ASSERT_CALLS
    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/draft_notes/10'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'updated body' }),
    });
    assert.deepStrictEqual(result, expected);
    // #endregion END_UPDATE_DRAFT_NOTE_ASSERT_CALLS
  });

  it('deleteDraftNote should send DELETE to correct URL and resolve void', async () => {
    const { requestFn, discussions } = createDraftNoteContext();

    await discussions.deleteDraftNote({
      project: 'group/repo',
      iid: 42,
      draftNoteId: '10',
    });

    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/draft_notes/10'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'DELETE' });
  });

  it('publishDraftNote should send PUT to publish endpoint and resolve void', async () => {
    const { requestFn, discussions } = createDraftNoteContext();

    await discussions.publishDraftNote({
      project: 'group/repo',
      iid: 42,
      draftNoteId: '10',
    });

    assert.strictEqual(requestFn.mock.callCount(), 1);
    assert.strictEqual(
      requestFn.mock.calls[0].arguments[0],
      '/projects/group%2Frepo/merge_requests/42/draft_notes/10/publish'
    );
    assert.deepStrictEqual(requestFn.mock.calls[0].arguments[1], { method: 'PUT' });
  });

  it('VcsDraftNote type contract', () => {
    // contract: VcsDraftNote { id, body, author } — all string fields
    // failure mode: do NOT accept shape with extra or missing fields

    const note: VcsDraftNote = { id: '1', body: 'text', author: 'alice' };

    assert.strictEqual(typeof note.id, 'string');
    assert.strictEqual(typeof note.body, 'string');
    assert.strictEqual(typeof note.author, 'string');
  });

  // @ts-expect-error — body is required for createDraftNote; missing field must fail compile
  const _createCheck: VcsCreateDraftNoteQuery = {
    project: 'g/r',
    iid: 42,
  };

  it('deleteDiscussion should propagate network error', async () => {
    // contract: Error Policy — network/status errors are thrown outward from request()
    // failure mode: do NOT wrap or swallow errors silently

    const { discussions } = createDraftNoteContext({
      requestImpl: async () => {
        throw new Error('GitLab request failed: 404 Not Found ');
      },
    });

    await assert.rejects(
      () =>
        discussions.deleteDiscussion({
          project: 'g/r',
          iid: 1,
          discussionId: 'abc',
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /404/);
        return true;
      }
    );
  });
});
