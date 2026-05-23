// @file: Normalized launch arguments for resolve-conflicts.
// @consumers: resolve-conflicts-command-args-parse.logic, resolve-conflicts-command-run.logic, resolve-conflicts-context-git-build.logic
// @tasks: N/A

/**
 * @purpose Normalized launch arguments for resolve-conflicts.
 * @consumer resolve-conflicts-command-args-parse.logic
 */
export type ResolveConflictsCommandArgs = {
  branch?: string;
  incoming?: string;
};
