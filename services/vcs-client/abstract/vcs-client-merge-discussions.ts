// @file: Contract surface for merge request discussion operations.
// @consumers: VcsClient

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
}
