// @file: Value object for delete discussion query parameters.
// @consumers: VcsClientMergeDiscussions
// @tasks: TSK-86

/** @purpose Parameters for deleting an entire MR discussion. */
export type VcsDeleteDiscussionQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target discussion identifier */
  discussionId: string;
};
