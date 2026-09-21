// @file: Build git context for review launch (branch + origin remote).
// @spec: CLI-REVIEW
// @consumers: run-review-command.logic

import { getGitCurrentBranch, getGitRemote } from '../../../../../shared/backend/git/git-core.ts';
import type { ReviewContextGit } from '../types/review-context-git.type.ts';

/**
 * @purpose Build git context for review launch (branch + origin remote).
 * @param [branchOverride] Explicitly specified branch from CLI.
 * @returns ReviewContextGit.
 * @consumer run-review-command.logic
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
