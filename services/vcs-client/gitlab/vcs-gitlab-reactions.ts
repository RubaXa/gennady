// @file: GitLab award emoji adapter — add/remove emoji reactions on MR notes.
// @consumers: VcsGitlabClient
// @tasks: TSK-98

import { VcsClientReactions } from '../abstract/vcs-client-reactions.ts';
import type { VcsReactionQuery } from '../entities/vcs-reaction-query.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose GitLab emoji reactions via award_emoji REST API.
 * @consumer VcsGitlabClient
 */
export class VcsGitlabReactions extends VcsClientReactions {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitLab reaction endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @returns Nothing; void operation.
   * @sideEffect Network: POST /projects/:id/merge_requests/:iid/notes/:note_id/award_emoji?name=<emoji>
   * @see {VcsClientReactions#add} in services/vcs-client/abstract/vcs-client-reactions.ts
   */
  async add(query: VcsReactionQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(query.noteId);
    await this._request(
      `/projects/${projectId}/merge_requests/${iid}/notes/${noteId}/award_emoji?name=${encodeURIComponent(query.emoji)}`,
      { method: 'POST' }
    );
  }

  /**
   * @param query Parameters: { project, iid, noteId, emoji }.
   * @returns Nothing; void operation.
   * @sideEffect Network: DELETE /projects/:id/merge_requests/:iid/notes/:note_id/award_emoji/<award_id>
   * @see {VcsClientReactions#remove} in services/vcs-client/abstract/vcs-client-reactions.ts
   */
  async remove(query: VcsReactionQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(query.noteId);
    await this._request(
      `/projects/${projectId}/merge_requests/${iid}/notes/${noteId}/award_emoji/${encodeURIComponent(query.emoji)}`,
      { method: 'DELETE' }
    );
  }
}
