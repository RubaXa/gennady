// @file: Нормализованные аргументы запуска review-команд.
// @consumers: parse-review-command-args.logic, resolve-review-intent.logic, review-command-options.type
// @tasks: N/A

/**
 * @purpose Нормализованные аргументы запуска review-команд.
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
