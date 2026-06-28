// @file: GitHub pull request comments adapter — maps issue comments + review comments to unified discussion format.
// @consumers: VcsGithubClient
// @tasks: TSK-30, TSK-95

import {
  VcsClientMergeDiscussions,
  type VcsAddNoteQuery,
  type VcsCreateDiscussionQuery,
  type VcsCreateDraftNoteQuery,
  type VcsDeleteDraftNoteQuery,
  type VcsDiscussionsListQuery,
  type VcsPublishDraftNoteQuery,
  type VcsUpdateDraftNoteQuery,
} from '../abstract/vcs-client-merge-discussions.ts';
import type { VcsResolveDiscussionQuery } from '../entities/vcs-resolve-discussion-query.type.ts';
import type { VcsUpdateNoteQuery } from '../entities/vcs-update-note-query.type.ts';
import type { VcsDeleteNoteQuery } from '../entities/vcs-delete-note-query.type.ts';
import type { VcsDeleteDiscussionQuery } from '../entities/vcs-delete-discussion-query.type.ts';
import type { VcsDraftNote } from '../entities/vcs-draft-note.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

function normalizeComment(
  c: Record<string, unknown>,
  type: 'general' | 'review'
): Record<string, unknown> {
  const user = c.user as { login?: string; name?: string } | undefined;
  const body = (c.body as string) ?? '';
  const createdAt = (c.created_at as string) ?? '';
  const id = (c.id as number) ?? 0;

  const discussion: Record<string, unknown> = {
    id: String(id),
    resolved: false,
    notes: [
      {
        id: String(id),
        author: {
          name: user?.login ?? 'unknown',
          username: user?.login ?? 'unknown',
        },
        body,
        created_at: createdAt,
        position: undefined as Record<string, unknown> | undefined,
      },
    ],
  };

  if (type === 'review') {
    const path = c.path as string | undefined;
    const line = c.line as number | undefined;
    const startLine = c.start_line as number | undefined;
    const diffHunk = c.diff_hunk as string | undefined;
    (discussion.notes as Array<Record<string, unknown>>)[0].position = {
      new_path: path,
      new_line: line ?? startLine,
      diff_hunk: diffHunk,
    };
  }

  return discussion;
}

/**
 * @purpose GitHub pull request comments — maps issue comments + review comments to discussions format.
 * @consumer VcsGithubClient
 */
export class VcsGithubMergeDiscussions extends VcsClientMergeDiscussions {
  /** @purpose Bound HTTP request function injected for GitHub API calls */
  protected _request: RequestFn;

  /**
   * @purpose Wire the HTTP request adapter for GitHub discussion endpoints.
   * @param request Authenticated HTTP request function targeting GitHub API.
   */
  constructor(request: RequestFn) {
    super();
    this._request = request;
  }

  /**
   * @param query Target repo, PR number.
   * @returns Normalized discussion list — issue comments + review comments.
   * @sideEffect Network: GET /repos/:repo/issues/:iid/comments + /repos/:repo/pulls/:iid/comments
   * @see {VcsClientMergeDiscussions#getList} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getList(query: VcsDiscussionsListQuery): Promise<unknown[]> {
    const repo = query.project;
    const iid = String(query.iid);

    const [issueComments, reviewComments] = await Promise.all([
      this._request(`/repos/${repo}/issues/${iid}/comments?per_page=100`) as Promise<
        Array<Record<string, unknown>>
      >,
      this._request(`/repos/${repo}/pulls/${iid}/comments?per_page=100`) as Promise<
        Array<Record<string, unknown>>
      >,
    ]);

    const general = (issueComments ?? []).map((c) => normalizeComment(c, 'general'));
    const review = (reviewComments ?? []).map((c) => normalizeComment(c, 'review'));
    return [...general, ...review];
  }

  /**
   * @param query Target repo, PR number.
   * @returns All discussions for the PR.
   * @sideEffect Network: delegates to getList.
   * @see {VcsClientMergeDiscussions#getAll} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async getAll(query: { project: string; iid: string | number }): Promise<unknown[]> {
    return this.getList({ project: query.project, iid: query.iid });
  }

  /**
   * @param query Target repo, PR number, and note body.
   * @returns Created comment object from GitHub API.
   * @sideEffect Network: POST /repos/:repo/issues/:iid/comments
   * @see {VcsClientMergeDiscussions#addNote} in services/vcs-client/abstract/vcs-merge-discussions.ts
   */
  async addNote(query: VcsAddNoteQuery): Promise<unknown> {
    const result = (await this._request(
      `/repos/${query.project}/issues/${String(query.iid)}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: query.body }),
      }
    )) as Record<string, unknown>;
    return result;
  }

  /**
   * @param query Target repo, PR number, optional position and body.
   * @returns Created discussion object.
   * @sideEffect Network: POST /repos/:repo/pulls/:iid/comments (line) or delegates to addNote (general).
   * @see {VcsClientMergeDiscussions#createDiscussion} in services/vcs-client/abstract/vcs-client-merge-discussions.ts
   */
  async createDiscussion(query: VcsCreateDiscussionQuery): Promise<unknown> {
    if (query.position) {
      const result = (await this._request(
        `/repos/${query.project}/pulls/${String(query.iid)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: query.body,
            path: query.position.newPath,
            line: query.position.newLine,
          }),
        }
      )) as Record<string, unknown>;
      return result;
    }
    return this.addNote({ ...query, discussionId: '' });
  }

  /**
   * @param _query Resolve parameters — not applicable to GitHub PRs.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async resolveDiscussion(_query: VcsResolveDiscussionQuery): Promise<void> {
    throw new Error('GitHub resolve discussion not implemented');
  }

  /**
   * @param _query Update parameters — not applicable to GitHub PRs.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async updateNote(_query: VcsUpdateNoteQuery): Promise<void> {
    throw new Error('GitHub update note not implemented');
  }

  /**
   * @param _query Delete parameters — not applicable to GitHub PRs.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async deleteNote(_query: VcsDeleteNoteQuery): Promise<void> {
    throw new Error('GitHub delete note not implemented');
  }

  /**
   * @param _query Delete parameters — not applicable to GitHub PRs.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async deleteDiscussion(_query: VcsDeleteDiscussionQuery): Promise<void> {
    throw new Error('GitHub delete discussion not implemented');
  }

  /**
   * @param _query Target repo and PR number.
   * @returns Empty list — GitHub does not have draft notes.
   * @sideEffect None.
   */
  async listDraftNotes(_query: { project: string; iid: string | number }): Promise<unknown[]> {
    return [];
  }

  /**
   * @param _query Draft note creation parameters.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async createDraftNote(_query: VcsCreateDraftNoteQuery): Promise<VcsDraftNote> {
    throw new Error('GitHub draft notes not implemented');
  }

  /**
   * @param _query Draft note update parameters.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async updateDraftNote(_query: VcsUpdateDraftNoteQuery): Promise<VcsDraftNote> {
    throw new Error('GitHub draft notes not implemented');
  }

  /**
   * @param _query Draft note delete parameters.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async deleteDraftNote(_query: VcsDeleteDraftNoteQuery): Promise<void> {
    throw new Error('GitHub draft notes not implemented');
  }

  /**
   * @param _query Draft note publish parameters.
   * @returns Nothing; throws not-implemented error.
   * @sideEffect None.
   */
  async publishDraftNote(_query: VcsPublishDraftNoteQuery): Promise<void> {
    throw new Error('GitHub draft notes not implemented');
  }
}
