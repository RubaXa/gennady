// @file: Normalized launch arguments for review commands.
// @consumers: parse-review-command-args.logic, resolve-review-intent.logic, review-command-options.type
// @tasks: N/A

/**
 * @purpose Normalized launch arguments for review commands.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export type ReviewCommandArgs = {
  branch?: string;
  url?: string;
  ref?: string;
  project?: string;
  iid?: string;
  all?: boolean;
};
