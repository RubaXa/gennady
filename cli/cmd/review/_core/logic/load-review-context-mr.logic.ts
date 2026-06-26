// @file: Load MR and discussions by ReviewIntent.
// @consumers: run-review-command.logic
// @tasks: N/A

import type { ReviewContextMr } from '../types/review-context-mr.type.ts';
import type { ReviewContextMrDiscussion } from '../types/review-context-mr.type.ts';
import type { ReviewContextMrNote } from '../types/review-context-mr.type.ts';
import type { ReviewContextVcs } from '../types/review-context-vcs.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';
import type { ReviewContextGit } from '../types/review-context-git.type.ts';

/**
 * @purpose Map GitLab draft notes (unpublished pending comments) onto the discussion
 *   shape so the artifact builder can treat them like single-note threads.
 * @param draftNotes Raw draft note objects from GitLab `draft_notes` endpoint.
 * @returns Discussions, one per draft note (the current user is the Reviewer).
 * @consumer loadReviewContextMr
 */
function mapDraftNotesToDiscussions(draftNotes: unknown[]): ReviewContextMrDiscussion[] {
  return (draftNotes as Array<Record<string, unknown>>).map((draftNote) => {
    const id = String(draftNote.id ?? '');
    const timestamp = (draftNote.updated_at as string) ?? (draftNote.created_at as string);
    return {
      id,
      resolvable: true,
      resolved: false,
      resolved_by: null,
      notes: [
        {
          id: typeof draftNote.id === 'number' ? (draftNote.id as number) : undefined,
          body: (draftNote.note as string) ?? '',
          system: false,
          position: (draftNote.position as ReviewContextMrNote['position']) ?? undefined,
          resolvable: true,
          updated_at: timestamp,
          resolved: false,
          resolved_by: null,
        },
      ],
    };
  });
}

/**
 * @purpose Load MR and discussions by ReviewIntent.
 * @param reviewIntent Review command launch intent.
 * @param reviewContextVcs VCS context with GitLab client.
 * @param [reviewContextGit] Git context (needed for branch fallback).
 * @param [draft] Draft mode — load the current user's unpublished draft notes instead of discussions.
 * @returns MR and list of discussions (or mapped draft notes) or null if MR not found.
 * @consumer run-review-command.logic
 */
export async function loadReviewContextMr(
  reviewIntent: ReviewIntent,
  reviewContextVcs: ReviewContextVcs,
  reviewContextGit?: ReviewContextGit,
  draft?: boolean
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
  const discussions = draft
    ? mapDraftNotesToDiscussions(
        await reviewContextVcs.vcs.MergeDiscussions.listDraftNotes({
          iid: mergeObj.iid,
          project: reviewContextVcs.project,
        })
      )
    : ((await reviewContextVcs.vcs.MergeDiscussions.getAll({
        iid: mergeObj.iid,
        project: reviewContextVcs.project,
      })) as ReviewContextMrDiscussion[]);

  return {
    mergeRequest: mergeObj,
    discussions,
  };
}
