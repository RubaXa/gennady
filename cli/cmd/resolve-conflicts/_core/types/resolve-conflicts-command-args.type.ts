// @file: Normalized launch arguments for resolve-conflicts.
// @consumers: resolve-conflicts-command-args-parse.logic, resolve-conflicts-command-run.logic, resolve-conflicts-context-git-build.logic
// @tasks: N/A

/**
 * @purpose Normalized launch arguments for resolve-conflicts.
 * @consumer resolve-conflicts-command-args-parse.logic
 */
export type ResolveConflictsCommandArgs = {
  /** @purpose Target branch name for the merge resolution. */
  branch?: string;
  /** @purpose Incoming branch name to merge into the target. */
  incoming?: string;
};
