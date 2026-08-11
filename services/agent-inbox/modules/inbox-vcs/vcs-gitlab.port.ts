// @file: VcsGitlabPort — production adapter from inbox-vcs VcsPort to the concrete GitLab client.
// @consumers: agent-inbox serve composition root
// @tasks: TSK-158, TSK-174

import { VcsGitlabClient } from '../../../vcs-client/gitlab/vcs-gitlab-client.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { logger } from '#logger';
import {
  VcsPort,
  type CompareResult,
  type VcsApprovalsResult,
  type DiscussionsPage,
  type MrDetail,
  type VcsDiscussion,
  type VcsCapabilities,
  type VcsReviewerState,
} from './vcs-port.ts';

/**
 * @purpose Concrete GitLab backing for the complete inbox-vcs surface.
 * @implements {VcsPort} in ./vcs-port.ts
 */
export class VcsGitlabPort extends VcsPort {
  /** @purpose The already configured GitLab client used by every VcsPort operation. */
  protected _client: VcsGitlabClient;
  /** @purpose Configured GitLab hostname used by the Effects SSRF guard. */
  protected _host: string;

  /**
   * @purpose Bind the configured concrete GitLab client and approved host.
   * @param client Authenticated GitLab client.
   * @param host Configured GitLab hostname.
   */
  constructor(client: VcsGitlabClient, host: string) {
    super();
    this._client = client;
    this._host = host;
  }

  /** @returns Authenticated GitLab username. @see {VcsPort#getCurrentUserLogin} */
  async getCurrentUserLogin(): Promise<string> {
    return (await this._client.getCurrentUser()).login;
  }

  /** @returns Actionable GitLab MRs. @see {VcsPort#getInbox} */
  async getInbox(): Promise<VcsActionableMr[]> {
    return this._client.Inbox.getActionable();
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @returns Normalized GitLab MR detail.
   * @see {VcsPort#getMrDetail}
   */
  async getMrDetail(project: string, iid: string): Promise<MrDetail> {
    const raw = (await this._client.MergeRequests.getByIid({ project, iid })) as Record<
      string,
      unknown
    > | null;
    if (!raw) throw new Error(`[VcsGitlabPort#getMrDetail] MR not found: ${project}!${iid}`);
    const users = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.map((item) => (item as { username?: string }).username ?? '').filter(Boolean)
        : [];
    return {
      project,
      iid,
      webUrl: String(raw.web_url ?? ''),
      title: String(raw.title ?? ''),
      sourceBranch: String(raw.source_branch ?? ''),
      targetBranch: String(raw.target_branch ?? ''),
      createdAt: String(raw.created_at ?? ''),
      description: String(raw.description ?? ''),
      author: (raw.author as { username?: string } | undefined)?.username ?? '',
      reviewers: users(raw.reviewers),
      assignees: users(raw.assignees),
      approvedBy: users(raw.approved_by ?? raw.approvedBy),
      updatedAt: String(raw.updated_at ?? ''),
      state: String(raw.state ?? ''),
      headSha: String(raw.sha ?? raw.diff_head_sha ?? ''),
      pipelineStatus: (raw.head_pipeline as { status?: string } | null)?.status ?? null,
      userNotesCount: Number(raw.user_notes_count ?? 0),
      draft: Boolean(raw.draft),
      approvalsRequired:
        typeof raw.approvals_required === 'number' ? raw.approvals_required : undefined,
    };
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param [cursor] REST page cursor.
   * @returns One normalized discussion page.
   * @see {VcsPort#getDiscussions}
   */
  async getDiscussions(
    project: string,
    iid: string,
    cursor?: string | null
  ): Promise<DiscussionsPage> {
    const page = cursor ? Number(cursor) : 1;
    const raw = await this._client.MergeDiscussions.getList({ project, iid, perPage: 100, page });
    const operatorLogin = await this.getCurrentUserLogin();
    const discussions = raw.map((entry) =>
      this._normalizeDiscussion(entry as Record<string, unknown>, operatorLogin)
    );
    return {
      discussions,
      pageInfo: {
        hasNextPage: discussions.length === 100,
        endCursor: discussions.length === 100 ? String(page + 1) : null,
      },
    };
  }

  /**
   * @param project Project path.
   * @param _iid MR IID.
   * @param from Earlier SHA.
   * @param to Current SHA.
   * @returns Complete GitLab repository comparison or an honest incomplete result.
   * @see {VcsPort#compareSha}
   */
  async compareSha(
    project: string,
    _iid: string,
    from: string,
    to: string
  ): Promise<CompareResult> {
    // #region START_COMPARE_SHA_THROUGH_GITLAB
    try {
      return await this._client.compareMergeRequestCommits(project, from, to);
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabPort#compareSha] Commit comparison failed for ${project}!${_iid}`,
        { cause }
      );
      logger.error('[VcsGitlabPort#compareSha] [reading → failed] Commit comparison failed', {
        error,
        project,
        iid: _iid,
        from,
        to,
      });
      throw error;
    }
    // #endregion END_COMPARE_SHA_THROUGH_GITLAB
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Approvers and explicit endpoint completeness.
   * @see {VcsPort#getApprovals} in ./vcs-port.ts
   */
  override async getApprovals(project: string, iid: string): Promise<VcsApprovalsResult> {
    // #region START_READ_APPROVALS_THROUGH_GITLAB
    try {
      return await this._client.getMergeRequestApprovals(project, iid);
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabPort#getApprovals] Approval observation failed for ${project}!${iid}`,
        { cause }
      );
      logger.error('[VcsGitlabPort#getApprovals] [reading → failed] Approval observation failed', {
        error,
        project,
        iid,
      });
      throw error;
    }
    // #endregion END_READ_APPROVALS_THROUGH_GITLAB
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param body Note body.
   * @param [discussionId] Existing discussion ID.
   * @returns Completion after GitLab accepts the note.
   * @see {VcsPort#postNote}
   */
  async postNote(project: string, iid: string, body: string, discussionId?: string): Promise<void> {
    if (discussionId)
      await this._client.MergeDiscussions.addNote({ project, iid, discussionId, body });
    else await this._client.MergeDiscussions.createDiscussion({ project, iid, body });
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param body Discussion body.
   * @returns Completion after GitLab accepts it.
   * @see {VcsPort#postDiscussion}
   */
  async postDiscussion(project: string, iid: string, body: string): Promise<void> {
    await this.postNote(project, iid, body);
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param noteId Note ID.
   * @param emoji Emoji name.
   * @returns Completion after GitLab accepts the reaction.
   * @see {VcsPort#react}
   */
  async react(project: string, iid: string, noteId: string, emoji: string): Promise<void> {
    await this._client.Reactions.add({ project, iid, noteId, emoji });
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param discussionId Discussion ID.
   * @returns Completion after GitLab resolves it.
   * @see {VcsPort#resolve}
   */
  async resolve(project: string, iid: string, discussionId: string): Promise<void> {
    await this._client.MergeDiscussions.resolveDiscussion({
      project,
      iid,
      discussionId,
      resolved: true,
    });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param discussionId Existing discussion target.
   * @returns Completion after GitLab accepts the mutation.
   * @see {VcsEffectPort#reopen} in ./vcs-port.ts
   */
  async reopen(project: string, iid: string, discussionId: string): Promise<void> {
    // #region START_REOPEN_DISCUSSION_THROUGH_GITLAB
    try {
      await this._client.MergeDiscussions.resolveDiscussion({
        project,
        iid,
        discussionId,
        resolved: false,
      });
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabPort#reopen] Discussion reopen failed for ${project}!${iid}`,
        { cause }
      );
      logger.error('[VcsGitlabPort#reopen] [applying → failed] Discussion reopen failed', {
        error,
        project,
        iid,
        discussionId,
      });
      throw error;
    }
    // #endregion END_REOPEN_DISCUSSION_THROUGH_GITLAB
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @returns Completion after GitLab approves it.
   * @see {VcsPort#approve}
   */
  async approve(project: string, iid: string): Promise<void> {
    await this._client.MergeRequests.approve({ repository: project, iid });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Completion after GitLab accepts the mutation.
   * @see {VcsEffectPort#unapprove} in ./vcs-port.ts
   */
  async unapprove(project: string, iid: string): Promise<void> {
    // #region START_UNAPPROVE_THROUGH_GITLAB
    try {
      await this._client.MergeRequests.unapprove({ repository: project, iid });
    } catch (cause) {
      const error = new Error(`[VcsGitlabPort#unapprove] Unapprove failed for ${project}!${iid}`, {
        cause,
      });
      logger.error('[VcsGitlabPort#unapprove] [applying → failed] Unapprove failed', {
        error,
        project,
        iid,
      });
      throw error;
    }
    // #endregion END_UNAPPROVE_THROUGH_GITLAB
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Completion after GitLab accepts the mutation.
   * @see {VcsEffectPort#requestChanges} in ./vcs-port.ts
   */
  async requestChanges(project: string, iid: string): Promise<void> {
    // #region START_APPLY_REQUEST_CHANGES_THROUGH_GITLAB
    try {
      await this._client.requestChanges(project, iid);
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabPort#requestChanges] Native request-changes failed for ${project}!${iid}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabPort#requestChanges] [applying → failed] Native request-changes failed',
        { error, project, iid }
      );
      throw error;
    }
    // #endregion END_APPLY_REQUEST_CHANGES_THROUGH_GITLAB
  }

  /**
   * @returns Conservative capability result with GraphQL evidence.
   * @see {VcsReadPort#probeCapabilities} in ./vcs-port.ts
   */
  async probeCapabilities(): Promise<VcsCapabilities> {
    // #region START_DEGRADE_CAPABILITY_PROBE
    try {
      const supported = await this._client.supportsRequestChanges();
      return {
        requestChanges: supported,
        evidence: supported
          ? 'graphql:mergeRequestRequestChanges+UserMergeRequestInteraction.reviewState'
          : 'graphql-native-request-changes-fields-absent',
      };
    } catch (cause) {
      const error = new Error('[VcsGitlabPort#probeCapabilities] Capability probe unavailable', {
        cause,
      });
      logger.error(
        '[VcsGitlabPort#probeCapabilities] [probing → unavailable] Capability probe unavailable',
        { error }
      );
      return {
        requestChanges: false,
        evidence: 'graphql-capability-probe-failed',
      };
    }
    // #endregion END_DEGRADE_CAPABILITY_PROBE
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Closed native reviewer state.
   * @see {VcsPort#readReviewerState} in ./vcs-port.ts
   */
  async readReviewerState(project: string, iid: string): Promise<VcsReviewerState> {
    let state: string | null;
    // #region START_REVIEW_STATE_DEGRADE_UNSUPPORTED_HOST
    try {
      const supported = await this._client.supportsRequestChanges();
      if (!supported) {
        logger.debug(
          '[VcsGitlabPort#readReviewerState] [probing → unavailable] Native reviewer state unsupported',
          { project, iid }
        );
        return 'unknown';
      }
      state = await this._client.getCurrentUserReviewState(project, iid);
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabPort#readReviewerState] Native reviewer state unavailable for ${project}!${iid}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabPort#readReviewerState] [reading → unavailable] Native reviewer state unavailable',
        { error, project, iid }
      );
      return 'unknown';
    }
    // #endregion END_REVIEW_STATE_DEGRADE_UNSUPPORTED_HOST
    const normalized = state?.toLowerCase();
    return [
      'approved',
      'requested_changes',
      'reviewed',
      'review_started',
      'unapproved',
      'unreviewed',
    ].includes(normalized ?? '')
      ? (normalized as VcsReviewerState)
      : 'unknown';
  }

  /**
   * @param project Project path.
   * @param iid MR IID.
   * @param description New description.
   * @returns Completion after GitLab updates it.
   * @see {VcsPort#editDescription}
   */
  async editDescription(project: string, iid: string, description: string): Promise<void> {
    await this._client.MergeRequests.update({ project, iid, description });
  }

  /** @returns The configured and SSRF-approved GitLab host. @see {VcsPort#getHost} */
  getHost(): string {
    return this._host;
  }

  /**
   * @purpose Normalize GitLab REST discussion JSON at the adapter boundary.
   * @param raw Raw GitLab REST discussion.
   * @param [operatorLogin] Authenticated login used to retain owned reactions.
   * @returns Closed inbox-vcs discussion.
   */
  protected _normalizeDiscussion(raw: Record<string, unknown>, operatorLogin = ''): VcsDiscussion {
    const notes = Array.isArray(raw.notes) ? raw.notes : [];
    const first = notes[0] as Record<string, unknown> | undefined;
    const position = first?.position as Record<string, unknown> | undefined;
    const path = position?.new_path as string | undefined;
    const line = position?.new_line as number | undefined;
    const headSha = position?.head_sha as string | undefined;
    return {
      id: String(raw.id ?? ''),
      resolved: Boolean(first?.resolved),
      notes: notes.map((note) => {
        const entry = note as Record<string, unknown>;
        return {
          id: String(entry.id ?? ''),
          author: (entry.author as { username?: string } | undefined)?.username ?? '',
          body: String(entry.body ?? ''),
          createdAt: String(entry.created_at ?? ''),
          system: Boolean(entry.system),
          updatedAt:
            typeof entry.updated_at === 'string'
              ? entry.updated_at
              : String(entry.created_at ?? ''),
          reactions: (Array.isArray(entry.award_emoji) ? entry.award_emoji : [])
            .filter(
              (award) =>
                (award as { user?: { username?: string } }).user?.username === operatorLogin
            )
            .map((award) => String((award as { name?: string }).name ?? ''))
            .filter(Boolean),
        };
      }),
      ...(path && typeof line === 'number' && headSha ? { position: { path, line, headSha } } : {}),
    };
  }
}
