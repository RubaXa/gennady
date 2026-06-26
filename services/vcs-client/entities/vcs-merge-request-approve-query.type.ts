// @file: Parameters for approving a merge request — repository and IID.
// @consumers: VcsClientMergeRequests
// @tasks: TSK-67, TSK-73

/** @purpose Parameters for approving a merge request. */
export type VcsMergeRequestApproveQuery = {
  /** @purpose Project full path (e.g. group/subgroup/project) */
  repository: string;
  /** @purpose Merge request internal ID within the project */
  iid: string | number;
};
