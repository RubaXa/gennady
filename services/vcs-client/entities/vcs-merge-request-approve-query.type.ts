// @file: Parameters for approving a merge request — repository and IID.
// @spec: VCS-VCS-CLIENT
// @consumers: VcsClientMergeRequests

/** @purpose Parameters for approving a merge request. */
export type VcsMergeRequestApproveQuery = {
  /** @purpose Project full path (e.g. group/subgroup/project) */
  repository: string;
  /** @purpose Merge request internal ID within the project */
  iid: string | number;
};
