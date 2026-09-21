// @file: Value object for delete note query parameters.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClientMergeDiscussions

/** @purpose Parameters for deleting an existing MR discussion note. */
export type VcsDeleteNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target note identifier */
  noteId: string | number;
  /** @purpose Optional discussion identifier for context | @invariant Not required by API, informational only */
  discussionId?: string;
};
