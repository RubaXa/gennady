// @file: Contract surface for merge request discussion operations.
// @consumers: VcsClient
// @tasks: TSK-71, TSK-86

import type { VcsDraftNote } from '../entities/vcs-draft-note.type.ts';
import type { VcsDeleteDiscussionQuery } from '../entities/vcs-delete-discussion-query.type.ts';
import type { VcsResolveDiscussionQuery } from '../entities/vcs-resolve-discussion-query.type.ts';
import type { VcsUpdateNoteQuery } from '../entities/vcs-update-note-query.type.ts';
import type { VcsDeleteNoteQuery } from '../entities/vcs-delete-note-query.type.ts';

/**
 * @purpose Parameters for creating a note in an MR discussion: project, MR IID, discussion ID, text.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsAddNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target discussion identifier */
  discussionId: string;
  /** @purpose Note body text in Markdown */
  body: string;
};

/**
 * @purpose Diff position for a line-level discussion (text diff).
 * @consumer VcsClientMergeDiscussions
 */
export type VcsDiscussionPosition = {
  /** @purpose Base commit SHA of the diff */
  baseSha: string;
  /** @purpose Start commit SHA of the diff */
  startSha: string;
  /** @purpose Head commit SHA of the diff */
  headSha: string;
  /** @purpose New file path */
  newPath: string;
  /** @purpose Old file path | @invariant Defaults to newPath when absent */
  oldPath?: string;
  /** @purpose Line number in the new file (added/context line) */
  newLine?: number;
  /** @purpose Line number in the old file (removed line) */
  oldLine?: number;
};

/**
 * @purpose Parameters for creating a new MR discussion: a general note, or a
 *   line-level comment when `position` is given.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsCreateDiscussionQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Discussion body text in Markdown */
  body: string;
  /** @purpose Diff position for a line-level comment | @invariant General MR note when absent */
  position?: VcsDiscussionPosition;
};

/**
 * @purpose Parameters for querying MR discussion list: project, MR IID, pagination.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsDiscussionsListQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Page size | @invariant Default: GitLab default when absent */
  perPage?: number;
  /** @purpose Page number starting from 1 */
  page?: number;
};

/**
 * @purpose Parameters for creating a draft note in an MR.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsCreateDraftNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Draft note body in Markdown */
  body: string;
  /** @purpose Diff position for a line-level comment | @invariant General MR draft note when absent */
  position?: VcsDiscussionPosition;
};

/**
 * @purpose Parameters for updating an existing draft note.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsUpdateDraftNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target draft note identifier */
  draftNoteId: string | number;
  /** @purpose Updated draft note body in Markdown */
  body: string;
  /** @purpose Updated diff position | @invariant Kept unchanged when absent */
  position?: VcsDiscussionPosition;
};

/**
 * @purpose Parameters for deleting an unpublished draft note.
 * @consumer VcsClientMergeDiscussions
 */
export type VcsDeleteDraftNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target draft note identifier */
  draftNoteId: string | number;
};

/**
 * @purpose Parameters for publishing a draft note (turning it into a regular note).
 * @consumer VcsClientMergeDiscussions
 */
export type VcsPublishDraftNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target draft note identifier */
  draftNoteId: string | number;
};

/**
 * @purpose Access to Discussions for Merge Requests in GitLab.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsClient
 */
export abstract class VcsClientMergeDiscussions {
  /**
   * @purpose Create a reply (note) in an existing Merge Request discussion.
   * @param query Query parameters.
   * @returns Created note object (JSON), as returned by GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
   */
  abstract addNote(query: VcsAddNoteQuery): Promise<unknown>;

  /**
   * @purpose Create a new MR discussion — a general note, or a line-level comment on the diff.
   * @param query Parameters: { project, iid, body, position? }.
   * @returns Created discussion object (JSON), as returned by GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions
   */
  abstract createDiscussion(query: VcsCreateDiscussionQuery): Promise<unknown>;

  /**
   * @purpose Get a page of MR discussions.
   * @param query Parameters: { project, iid, perPage?, page? }.
   * @returns List of discussions for the current page.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
   */
  abstract getList(query: VcsDiscussionsListQuery): Promise<unknown[]>;

  /**
   * @purpose Collect all pages of MR discussions.
   * @param query Parameters: { project, iid }.
   * @returns Complete list of MR discussions.
   * @sideEffect Network: Multiple GET requests for paginated loading.
   */
  abstract getAll(query: { project: string; iid: string | number }): Promise<unknown[]>;

  /**
   * @purpose Collect the authenticated user's unpublished draft notes for an MR.
   * @param query Parameters: { project, iid }.
   * @returns Complete list of draft notes (only the current user's own drafts).
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/draft_notes (paginated).
   */
  abstract listDraftNotes(query: { project: string; iid: string | number }): Promise<unknown[]>;

  /**
   * @purpose Resolve or reopen a discussion by setting the resolved flag.
   * @param query Parameters: { project, iid, discussionId, resolved }.
   * @throws {VcsError} on 403/404 status from GitLab API.
   * @returns void on success.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/discussions/:discussion_id?resolved=true|false
   */
  abstract resolveDiscussion(query: VcsResolveDiscussionQuery): Promise<void>;

  /**
   * @purpose Edit the body of an existing discussion note. Only the note author may edit.
   * @param query Parameters: { project, iid, noteId, body }.
   * @returns void on success.
   * @throws {Error} When the note belongs to a different author.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/notes/:note_id
   */
  abstract updateNote(query: VcsUpdateNoteQuery): Promise<void>;

  /**
   * @purpose Delete an existing discussion note. Only the note author may delete.
   * @param query Parameters: { project, iid, noteId, discussionId? }.
   * @returns void on success.
   * @throws {Error} When the note belongs to a different author.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/notes/:note_id
   */
  abstract deleteNote(query: VcsDeleteNoteQuery): Promise<void>;

  /**
   * @purpose Delete an entire discussion (thread) from an MR.
   * @param query Parameters: { project, iid, discussionId }.
   * @returns void on success.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/discussions/:discussion_id
   */
  abstract deleteDiscussion(query: VcsDeleteDiscussionQuery): Promise<void>;

  /**
   * @purpose Create a new draft note (unpublished comment) on an MR.
   * @param query Parameters: { project, iid, body, position? }.
   * @returns Created draft note object.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/draft_notes
   */
  abstract createDraftNote(query: VcsCreateDraftNoteQuery): Promise<VcsDraftNote>;

  /**
   * @purpose Update the body and/or position of an existing draft note.
   * @param query Parameters: { project, iid, draftNoteId, body, position? }.
   * @returns Updated draft note object.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id
   */
  abstract updateDraftNote(query: VcsUpdateDraftNoteQuery): Promise<VcsDraftNote>;

  /**
   * @purpose Delete an unpublished draft note.
   * @param query Parameters: { project, iid, draftNoteId }.
   * @returns void on success.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id
   */
  abstract deleteDraftNote(query: VcsDeleteDraftNoteQuery): Promise<void>;

  /**
   * @purpose Publish a draft note, turning it into a regular discussion note.
   * @param query Parameters: { project, iid, draftNoteId }.
   * @returns void on success.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id/publish
   */
  abstract publishDraftNote(query: VcsPublishDraftNoteQuery): Promise<void>;
}
