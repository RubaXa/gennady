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
}
