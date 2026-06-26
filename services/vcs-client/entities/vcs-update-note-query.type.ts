// @file: Value object for update note query parameters.
// @consumers: VcsClientMergeDiscussions
// @tasks: TSK-77

/** @purpose Parameters for editing an existing MR discussion note. */
export type VcsUpdateNoteQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target note identifier */
  noteId: string | number;
  /** @purpose New note body text in Markdown */
  body: string;
};
