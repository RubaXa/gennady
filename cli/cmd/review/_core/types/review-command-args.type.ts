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
