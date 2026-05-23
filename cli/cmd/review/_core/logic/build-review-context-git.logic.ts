// @file: Собрать git-контекст review-запуска (branch + origin remote).
// @consumers: run-review-command.logic
// @tasks: N/A

import { getGitCurrentBranch, getGitRemote } from '../../../../../shared/backend/git/git-core.ts';
import type { ReviewContextGit } from '../types/review-context-git.type.ts';

/**
 * @purpose Собрать git-контекст review-запуска (branch + origin remote).
 * @consumer run-review-command.logic
 * @param [branchOverride] Явно заданная ветка из CLI.
 * @returns ReviewContextGit.
 */
export function buildReviewContextGit(branchOverride?: string): ReviewContextGit {
  const remote = getGitRemote();
  if (!remote) {
    throw new Error('Не найден удалённый репозиторий origin.');
  }

  const branch = branchOverride?.trim() || getGitCurrentBranch();

  return {
    branch,
    remote,
  };
}
