// @file: GitLab-specific implementation of merge request discussion operations.
// @consumers: VcsGitlabClient
// @tasks: TSK-71, TSK-86

import {
  VcsClientMergeDiscussions,
  type VcsAddNoteQuery,
  type VcsCreateDiscussionQuery,
  type VcsDiscussionsListQuery,
  type VcsCreateDraftNoteQuery,
  type VcsUpdateDraftNoteQuery,
  type VcsDeleteDraftNoteQuery,
  type VcsPublishDraftNoteQuery,
} from '../abstract/vcs-client-merge-discussions.ts';
import type { VcsDraftNote } from '../entities/vcs-draft-note.type.ts';
import type { VcsDeleteDiscussionQuery } from '../entities/vcs-delete-discussion-query.type.ts';
import type { VcsResolveDiscussionQuery } from '../entities/vcs-resolve-discussion-query.type.ts';
import type { VcsUpdateNoteQuery } from '../entities/vcs-update-note-query.type.ts';
import type { VcsDeleteNoteQuery } from '../entities/vcs-delete-note-query.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Access to Discussions for Merge Requests in GitLab.
 * @invariant Error Policy: Network/status errors are thrown outward from request().
 * @consumer VcsGitlabClient
 */
export class VcsGitlabMergeDiscussions extends VcsClientMergeDiscussions {
  /** @purpose Bound HTTP request function injected for GitLab API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitLab merge discussion endpoints.
   * @param request Authenticated HTTP request function targeting GitLab API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @param query Target project, MR, discussion, and note body.
   * @returns Created note object from GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions/:discussion_id/notes
   * @see {VcsClientMergeDiscussions#addNote} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async addNote(query: VcsAddNoteQuery): Promise<unknown> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const discussionId = encodeURIComponent(query.discussionId);
    return this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: query.body }),
      }
    );
  }

  /**
   * @param query Target project, MR, body, and optional diff position.
   * @returns Created discussion object from GitLab API.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions
   * @see {VcsClientMergeDiscussions#createDiscussion} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async createDiscussion(query: VcsCreateDiscussionQuery): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('body', query.body);
    const pos = query.position;
    if (pos) {
      params.set('position[position_type]', 'text');
      params.set('position[base_sha]', pos.baseSha);
      params.set('position[start_sha]', pos.startSha);
      params.set('position[head_sha]', pos.headSha);
      params.set('position[new_path]', pos.newPath);
      params.set('position[old_path]', pos.oldPath ?? pos.newPath);
      if (typeof pos.newLine === 'number') params.set('position[new_line]', String(pos.newLine));
      if (typeof pos.oldLine === 'number') params.set('position[old_line]', String(pos.oldLine));
    }
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    return this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions?${params.toString()}`,
      { method: 'POST' }
    );
  }

  /**
   * @param query Target project, MR, and optional pagination.
   * @returns List of discussions for the requested page.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/discussions
   * @see {VcsClientMergeDiscussions#getList} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getList(query: VcsDiscussionsListQuery): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (query?.perPage) params.set('per_page', String(query.perPage));
    if (query?.page) params.set('page', String(query.page));
    const projectId = encodeURIComponent(query.project);
    const result = await this._request(
      `/projects/${projectId}/merge_requests/${encodeURIComponent(String(query.iid))}/discussions?${params.toString()}`
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * @param query Target project and MR.
   * @returns Complete list of all discussions across all pages.
   * @sideEffect Network: Multiple GET requests for paginated loading.
   * @see {VcsClientMergeDiscussions#getAll} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getAll(query: { project: string; iid: string | number }): Promise<unknown[]> {
    const perPage = 100;
    let page = 1;
    const all: unknown[] = [];

    while (true) {
      const chunk = await this.getList({ ...query, perPage, page });
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < perPage) break;
      page += 1;
    }

    return all;
  }

  /**
   * @param query Target project and MR.
   * @returns The current user's draft notes (unpublished), across all pages.
   * @sideEffect Network: GET /projects/:project/merge_requests/:iid/draft_notes
   * @see {VcsClientMergeDiscussions#listDraftNotes} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async listDraftNotes(query: { project: string; iid: string | number }): Promise<unknown[]> {
    const perPage = 100;
    let page = 1;
    const all: unknown[] = [];
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));

    while (true) {
      const params = new URLSearchParams();
      params.set('per_page', String(perPage));
      params.set('page', String(page));
      const result = await this._request(
        `/projects/${projectId}/merge_requests/${iid}/draft_notes?${params.toString()}`
      );
      const chunk = Array.isArray(result) ? result : [];
      if (chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < perPage) break;
      page += 1;
    }

    return all;
  }

  /**
   * @param query Target project, MR, discussion, and resolved flag.
   * @throws {VcsError} on 403/404 status from GitLab API.
   * @returns void on success.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/discussions/:discussion_id?resolved=true|false
   * @see {VcsClientMergeDiscussions#resolveDiscussion} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async resolveDiscussion(query: VcsResolveDiscussionQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const discussionId = encodeURIComponent(query.discussionId);
    await this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}?resolved=${query.resolved}`,
      { method: 'PUT' }
    );
  }

  /**
   * @purpose Verify the current authenticated user is the note author; throw otherwise.
   * @param project Target project path.
   * @param iid MR internal ID.
   * @param noteId Target note ID.
   * @returns void on success.
   * @sideEffect Network: GET /projects/:id/merge_requests/:iid/notes/:note_id + GET /user
   */
  protected async _verifyNoteOwnership(
    project: string,
    iid: string,
    noteId: string
  ): Promise<void> {
    const note = (await this._request(
      `/projects/${encodeURIComponent(project)}/merge_requests/${iid}/notes/${noteId}`
    )) as { author?: { username?: string } };
    const currentUser = (await this._request('/user')) as { username?: string };

    if (note.author?.username !== currentUser.username) {
      throw new Error(
        `[VcsGitlabMergeDiscussions#_verifyNoteOwnership] Cannot modify another user's note`
      );
    }
  }

  /**
   * @param query Target project, MR, note, and new body.
   * @throws {Error} When the note belongs to a different author.
   * @returns void on success.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/notes/:note_id
   * @see {VcsClientMergeDiscussions#updateNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async updateNote(query: VcsUpdateNoteQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(String(query.noteId));

    await this._verifyNoteOwnership(query.project, String(query.iid), String(query.noteId));

    await this._request(`/projects/${projectId}/merge_requests/${iid}/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: query.body }),
    });
  }

  /**
   * @param query Target project, MR, and note.
   * @throws {Error} When the note belongs to a different author.
   * @returns void on success.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/notes/:note_id
   * @see {VcsClientMergeDiscussions#deleteNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async deleteNote(query: VcsDeleteNoteQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(String(query.noteId));

    await this._verifyNoteOwnership(query.project, String(query.iid), String(query.noteId));

    await this._request(`/projects/${projectId}/merge_requests/${iid}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  /**
   * @param query Target project, MR, and discussion.
   * @returns void on success.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/discussions/:discussion_id
   * @see {VcsClientMergeDiscussions#deleteDiscussion} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async deleteDiscussion(query: VcsDeleteDiscussionQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const discussionId = encodeURIComponent(query.discussionId);
    await this._request(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}`,
      { method: 'DELETE' }
    );
  }

  /**
   * @param query Target project, MR, draft note body, and optional diff position.
   * @returns Created draft note object.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/draft_notes
   * @see {VcsClientMergeDiscussions#createDraftNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async createDraftNote(query: VcsCreateDraftNoteQuery): Promise<VcsDraftNote> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const body: Record<string, unknown> = { note: query.body };
    if (query.position) {
      body.position = query.position;
    }
    return this._request(`/projects/${projectId}/merge_requests/${iid}/draft_notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as Promise<VcsDraftNote>;
  }

  /**
   * @param query Target project, MR, draft note ID, new body, and optional diff position.
   * @returns Updated draft note object.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id
   * @see {VcsClientMergeDiscussions#updateDraftNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async updateDraftNote(query: VcsUpdateDraftNoteQuery): Promise<VcsDraftNote> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(String(query.draftNoteId));
    const body: Record<string, unknown> = { note: query.body };
    if (query.position) {
      body.position = query.position;
    }
    return this._request(`/projects/${projectId}/merge_requests/${iid}/draft_notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as Promise<VcsDraftNote>;
  }

  /**
   * @param query Target project, MR, and draft note.
   * @returns void on success.
   * @sideEffect Network: DELETE /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id
   * @see {VcsClientMergeDiscussions#deleteDraftNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async deleteDraftNote(query: VcsDeleteDraftNoteQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(String(query.draftNoteId));
    await this._request(`/projects/${projectId}/merge_requests/${iid}/draft_notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  /**
   * @param query Target project, MR, and draft note.
   * @returns void on success.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/draft_notes/:draft_note_id/publish
   * @see {VcsClientMergeDiscussions#publishDraftNote} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async publishDraftNote(query: VcsPublishDraftNoteQuery): Promise<void> {
    const projectId = encodeURIComponent(query.project);
    const iid = encodeURIComponent(String(query.iid));
    const noteId = encodeURIComponent(String(query.draftNoteId));
    await this._request(
      `/projects/${projectId}/merge_requests/${iid}/draft_notes/${noteId}/publish`,
      { method: 'PUT' }
    );
  }
}
