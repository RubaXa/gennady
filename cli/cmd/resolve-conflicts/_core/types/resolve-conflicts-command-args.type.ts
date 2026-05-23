// @file: Нормализованные аргументы запуска resolve-conflicts.
// @consumers: resolve-conflicts-command-args-parse.logic, resolve-conflicts-command-run.logic, resolve-conflicts-context-git-build.logic
// @tasks: N/A

/**
 * @purpose Нормализованные аргументы запуска resolve-conflicts.
 * @consumer resolve-conflicts-command-args-parse.logic
 */
export type ResolveConflictsCommandArgs = {
  branch?: string;
  incoming?: string;
};
