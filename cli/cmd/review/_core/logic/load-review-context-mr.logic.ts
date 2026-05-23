// @file: Load MR and discussions by ReviewIntent.
// @consumers: run-review-command.logic
// @tasks: N/A

import type { ReviewContextMr } from '../types/review-context-mr.type.ts';
import type { ReviewContextMrDiscussion } from '../types/review-context-mr.type.ts';
import type { ReviewContextVcs } from '../types/review-context-vcs.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';
import type { ReviewContextGit } from '../types/review-context-git.type.ts';

/**
 * @purpose Load MR and discussions by ReviewIntent.
 * @param reviewIntent Review command launch intent.
 * @param reviewContextVcs VCS context with GitLab client.
 * @param [reviewContextGit] Git context (needed for branch fallback).
 * @returns MR and list of discussions or null if MR not found.
 * @consumer run-review-command.logic
 */
export async function loadReviewContextMr(
  reviewIntent: ReviewIntent,
  reviewContextVcs: ReviewContextVcs,
  reviewContextGit?: ReviewContextGit
): Promise<{ mergeRequest: ReviewContextMr; discussions: ReviewContextMrDiscussion[] } | null> {
  let mergeRequest: unknown | null = null;

  if (reviewIntent.source === 'branch') {
    const sourceBranch = reviewContextGit?.branch;
    if (!sourceBranch) {
      throw new Error('Не удалось определить ветку для поиска Merge Request.');
    }

    mergeRequest = await reviewContextVcs.vcs.MergeRequests.getOne({
      project: reviewContextVcs.project,
      sourceBranch,
      state: 'opened',
    });
  } else {
    mergeRequest = await reviewContextVcs.vcs.MergeRequests.getByIid({
      project: reviewContextVcs.project,
      iid: reviewIntent.iid,
    });
  }

  if (!mergeRequest) {
    return null;
  }

  const mergeObj = mergeRequest as ReviewContextMr;
  const discussions = (await reviewContextVcs.vcs.MergeDiscussions.getAll({
    iid: mergeObj.iid,
    project: reviewContextVcs.project,
  })) as ReviewContextMrDiscussion[];

  return {
    mergeRequest: mergeObj,
    discussions,
  };
}
