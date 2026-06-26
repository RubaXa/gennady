// @file: Normalized "merge request awaiting my reaction" shape for the inbox port.
// @consumers: VcsClient
// @tasks: N/A

/**
 * @purpose My relationship to a merge request — the axis the inbox groups by.
 * @invariant Exactly one role per MR, resolved by priority author > reviewer > mentioned.
 * @consumer VcsClientInbox
 */
export type VcsActionableRole = 'reviewer' | 'author' | 'mentioned';

/**
 * @purpose MR lifecycle state. Only `opened` is actionable; `merged`/`closed`/`locked`
 *   reach the inbox only via stale pending todos (GitLab does not auto-clear them).
 * @invariant Filtering of non-open MRs is the consumer's policy, not the adapter's.
 * @consumer VcsClientInbox
 */
export type VcsActionableMrState = 'opened' | 'closed' | 'locked' | 'merged';

/**
 * @purpose State events attached to an MR. They never create an inbox entry on
 *   their own — only decorate an MR that already has a role.
 * @consumer VcsClientInbox
 */
export type VcsActionableEvent =
  | 'ci_failed'
  | 'unmergeable'
  | 'merge_train_removed'
  | 'review_submitted';

/**
 * @purpose A merge request that requires the authenticated user's attention,
 *   merged across todos and currentUser MR connections.
 * @invariant Raw normalized fact: no filtering/staleness policy applied here.
 * @consumer VcsClientInbox
 */
export type VcsActionableMr = {
  /** @purpose Merge request internal ID within its project (GraphQL returns it as string) */
  iid: string;
  /** @purpose Project full path, e.g. group/subgroup/project */
  project: string;
  /** @purpose Web URL of the merge request */
  webUrl: string;
  /** @purpose Merge request title */
  title: string;
  /** @purpose MR description (may be long/empty); consumer truncates for cards */
  description: string;
  /** @purpose Author's username, e.g. `i.petrov`; empty when unknown */
  author: string;
  /** @purpose Reviewer usernames assigned to the MR (for context cards) */
  reviewers: string[];
  /** @purpose Usernames who approved the MR | @invariant "Did I approve" = caller checks own login here */
  approvedBy: string[];
  /** @purpose ISO timestamp of the last update | @invariant Used as polling cursor and staleness basis */
  updatedAt: string;
  /** @purpose Whether the MR is a draft | @invariant Filtering left to the caller */
  draft: boolean;
  /** @purpose MR lifecycle state | @invariant Only `opened` is actionable; non-open filtered by the caller */
  state: VcsActionableMrState;
  /** @purpose My role; null when only state events point here (no relationship) */
  role: VcsActionableRole | null;
  /** @purpose State events decorating the MR; do not create entries by themselves */
  events: VcsActionableEvent[];
  /** @purpose Whether I was directly addressed in a discussion (sorts to the top) */
  directlyAddressed: boolean;
};
