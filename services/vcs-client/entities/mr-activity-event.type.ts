// @file: Normalized merge-request activity event — provider-agnostic, derived from
//   GitLab system notes or GitHub timeline events. A single MR push/comment/approve
//   may produce multiple events.
// @consumers: inbox, review
// @tasks: N/A

/**
 * @purpose Kinds of activity that can occur on a merge request.
 *   Provider-agnostic — GitLab and GitHub both produce these event types.
 */
export type MrActivityEventType =
  | 'commits_pushed'
  | 'target_branch_merged'
  | 'description_changed'
  | 'title_changed'
  | 'draft_removed'
  | 'draft_marked'
  | 'approved'
  | 'unapproved'
  | 'target_branch_changed'
  | 'review_requested'
  | 'review_request_removed'
  | 'threads_resolved'
  | 'reopened'
  | 'commits_detected'
  | 'discussion_added';

/**
 * @purpose A detected activity event on a merge request — what happened, when,
 *   and a human-readable summary for display.
 */
export type MrActivityEvent = {
  /** @purpose Classification kind */
  type: MrActivityEventType;
  /** @purpose ISO timestamp when the event occurred */
  at: string;
  /** @purpose Human-readable Russian summary for display */
  summary: string;
  /** @purpose Optional detail: commit count, branch name, raw body, etc. */
  detail?: string;
};
