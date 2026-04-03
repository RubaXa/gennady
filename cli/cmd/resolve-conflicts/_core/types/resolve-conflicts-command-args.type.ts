/**
 * @purpose Нормализованные аргументы запуска resolve-conflicts.
 * @consumer resolve-conflicts-command-args-parse.logic
 */
export type ResolveConflictsCommandArgs = {
  branch?: string;
  incoming?: string;
};
