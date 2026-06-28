// @file: GitHub reactions adapter — add/remove emoji reactions on issue/PR comments.
// @consumers: VcsGithubClient
// @tasks: TSK-98

import { VcsClientReactions } from '../abstract/vcs-client-reactions.ts';
import type { VcsReactionQuery } from '../entities/vcs-reaction-query.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose GitHub emoji reactions via reactions REST API.
 * @consumer VcsGithubClient
 */
export class VcsGithubReactions extends VcsClientReactions {
  protected _request: RequestFn;

  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @purpose Add a reaction to a comment (issue comment or PR review comment).
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @sideEffect Network: POST /repos/:owner/:repo/issues/comments/:comment_id/reactions
   * @see {VcsClientReactions#add} in services/vcs-client/abstract/vcs-client-reactions.ts
   */
  async add(query: VcsReactionQuery): Promise<void> {
    await this._request(`/repos/${query.project}/issues/comments/${query.noteId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: query.emoji }),
    });
  }

  /**
   * @purpose Remove own reaction from a comment.
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @sideEffect Network: DELETE /repos/:owner/:repo/issues/comments/:comment_id/reactions/<reaction_id>
   * @see {VcsClientReactions#remove} in services/vcs-client/abstract/vcs-client-reactions.ts
   */
  async remove(query: VcsReactionQuery): Promise<void> {
    const reactions = (await this._request(
      `/repos/${query.project}/issues/comments/${query.noteId}/reactions`
    )) as Array<{ id: number; content: string }>;

    const mine = reactions.find((r) => r.content === query.emoji);
    if (mine) {
      await this._request(
        `/repos/${query.project}/issues/comments/${query.noteId}/reactions/${mine.id}`,
        { method: 'DELETE' }
      );
    }
  }
}
