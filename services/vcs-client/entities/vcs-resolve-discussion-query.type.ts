// @file: Value object for resolve discussion query parameters.
// @consumers: VcsClientMergeDiscussions
// @tasks: TSK-71

/** @purpose Parameters for resolving or reopening an MR discussion. */
export type VcsResolveDiscussionQuery = {
  /** @purpose GitLab project path or ID */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string | number;
  /** @purpose Target discussion identifier */
  discussionId: string;
  /** @purpose Whether to resolve (true) or reopen (false) the discussion */
  resolved: boolean;
};
