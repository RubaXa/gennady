// @file: Normalized launch arguments for review commands.
// @consumers: parse-review-command-args.logic, resolve-review-intent.logic, review-command-options.type
// @tasks: N/A

/**
 * @purpose Normalized launch arguments for review commands.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export type ReviewCommandArgs = {
  /** @purpose Branch name for the review. */
  branch?: string;
  /** @purpose MR URL for VCS-based review. */
  url?: string;
  /** @purpose Git ref to review. */
  ref?: string;
  /** @purpose VCS project path (owner/repo). */
  project?: string;
  /** @purpose MR IID for GitLab-based review. */
  iid?: string;
  /** @purpose Review all MRs (for review-verify --all). */
  all?: boolean;
  /** @purpose ISO cursor from previous run — only threads updated after this timestamp are returned. */
  since?: string;
  /** @purpose Draft mode — fetch the current user's unpublished draft notes instead of discussions. */
  draft?: boolean;
  /** @purpose Explicit VCS host override (e.g. gitlab.corp.mail.ru). */
  host?: string;
};
