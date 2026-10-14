// @file: Value object for an MR draft note returned by GitLab API.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClientMergeDiscussions

/** @purpose Draft note object returned by the GitLab draft notes API. */
export type VcsDraftNote = {
  /** @purpose Draft note identifier | @invariant Numeric string format */
  id: string;
  /** @purpose Draft note body in Markdown */
  body: string;
  /** @purpose Author of the draft note */
  author: string;
};
