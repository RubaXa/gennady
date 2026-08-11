// @file: Unified VCS read/effect contract, snapshots, capabilities, requests, and outcomes.
// @consumers: SyncService, Effects, BackgroundVerifier
// @tasks: TSK-158, TSK-174

import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose Normalized MR detail returned by getMrDetail — poll-tier fields plus enriched metadata. */
export type MrDetail = {
  /** @purpose Project full path (e.g. group/subgroup/project) */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose MR web URL */
  webUrl: string;
  /** @purpose MR title */
  title: string;
  /** @purpose Source branch name */
  sourceBranch?: string;
  /** @purpose Target branch name */
  targetBranch?: string;
  /** @purpose ISO timestamp of MR creation */
  createdAt?: string;
  /** @purpose MR description in Markdown */
  description: string;
  /** @purpose MR author username */
  author: string;
  /** @purpose Assigned reviewer usernames */
  reviewers: string[];
  /** @purpose Assigned user usernames */
  assignees?: string[];
  /** @purpose Usernames who approved the MR */
  approvedBy: string[];
  /** @purpose ISO timestamp of last update */
  updatedAt: string;
  /** @purpose MR lifecycle state */
  state: string;
  /** @purpose Head commit SHA */
  headSha: string;
  /** @purpose CI pipeline status */
  pipelineStatus: string | null;
  /** @purpose Number of user notes */
  userNotesCount: number;
  /** @purpose Whether MR is a draft */
  draft: boolean;
  /** @purpose Number of required approvals from project settings */
  approvalsRequired?: number;
  /** @purpose Current operator review state when the host exposes native review state */
  reviewerState?: VcsReviewerState;
};

/** @purpose Native reviewer state observed from the provider. */
export type VcsReviewerState =
  | 'approved'
  | 'requested_changes'
  | 'reviewed'
  | 'review_started'
  | 'unapproved'
  | 'unreviewed'
  | 'unknown';

/** @purpose Inclusive reasons that make one open MR eligible for discovery. */
export type VcsParticipation = {
  /** @purpose Operator authored the MR */
  author: boolean;
  /** @purpose Operator is a requested reviewer */
  reviewer: boolean;
  /** @purpose Operator is assigned to the MR */
  assignee: boolean;
  /** @purpose Operator was mentioned or directly addressed */
  mentioned: boolean;
  /** @purpose Operator authored at least one MR note */
  commented: boolean;
  /** @purpose Operator approved the MR */
  approved: boolean;
};

/** @purpose Normalized discussion thread from an MR — position-aware for line-level threads. */
export type VcsDiscussion = {
  /** @purpose GitLab discussion ID */
  id: string;
  /** @purpose Whether the thread is resolved */
  resolved: boolean;
  /** @purpose All notes in this thread, oldest first */
  notes: VcsDiscussionNote[];
  /** @purpose Diff position for line-level discussions | @invariant Absent for general MR notes */
  position?: { path: string; line: number; headSha: string };
};

/** @purpose Single note within a discussion thread. */
export type VcsDiscussionNote = {
  /** @purpose GitLab note ID */
  id: string;
  /** @purpose Note author username */
  author: string;
  /** @purpose Note body text in Markdown */
  body: string;
  /** @purpose ISO timestamp of note creation */
  createdAt: string;
  /** @purpose Whether the note is system-generated */
  system: boolean;
  /** @purpose ISO timestamp of the latest note edit when provider exposes it */
  updatedAt?: string;
  /** @purpose Emoji names currently applied by the operator */
  reactions?: string[];
};

/** @purpose Completeness truth carried by every external observation. */
export type VcsSnapshotCompleteness = {
  /** @purpose Whether MR metadata was observed without fallback */
  detail: boolean;
  /** @purpose Whether every discussion page was observed */
  discussions: boolean;
  /** @purpose Whether approval and native review state were observed */
  approvals: boolean;
  /** @purpose Whether the complete commit range was observed. */
  commits: boolean;
  /** @purpose Whether pipeline state was observed */
  pipeline: boolean;
};

/** @purpose Immutable provider observation used by sync, normalization, and reconciliation. */
export type VcsSnapshot = {
  /** @purpose Canonical project path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose Provider web URL */
  webUrl: string;
  /** @purpose MR lifecycle state */
  state: 'open' | 'merged' | 'closed';
  /** @purpose Observation timestamp supplied by the provider */
  observedAt: string;
  /** @purpose Provider cursor advanced only for a complete observation */
  cursor: string;
  /** @purpose Current MR revision */
  headSha: string;
  /** @purpose Commits observed since the previous cursor, oldest first */
  commits: string[];
  /** @purpose Current description */
  description: string;
  /** @purpose Inclusive operator participation */
  participation: VcsParticipation;
  /** @purpose Complete normalized discussions */
  discussions: VcsDiscussion[];
  /** @purpose Current approver usernames */
  approvedBy: string[];
  /** @purpose Current operator native review state */
  reviewerState: VcsReviewerState;
  /** @purpose Current head pipeline state */
  pipelineStatus: string | null;
  /** @purpose Field-level observation completeness */
  completeness: VcsSnapshotCompleteness;
};

/** @purpose Closed provider effect vocabulary. */
export type VcsEffectKind =
  | 'comment'
  | 'reply'
  | 'react'
  | 'resolve'
  | 'reopen'
  | 'approve'
  | 'unapprove'
  | 'request_changes'
  | 'edit_description';

/** @purpose Permission facts evaluated immediately before one provider mutation. */
export type VcsEffectPermission = {
  /** @purpose Authenticated operator login */
  operatorLogin: string;
  /** @purpose Whether operator authored the MR */
  operatorIsMrAuthor: boolean;
  /** @purpose Whether operator has reviewer permission */
  reviewerPermission: boolean;
  /** @purpose First-note author for thread ownership actions */
  threadAuthor?: string;
  /** @purpose Whether the action was generated automatically */
  automatic: boolean;
};

/** @purpose One validated idempotency-addressed provider mutation. */
export type VcsEffectRequest = {
  /** @purpose Stable identity derived from MR, revision, kind and normalized payload */
  effectId: string;
  /** @purpose Closed mutation discriminator */
  kind: VcsEffectKind;
  /** @purpose Canonical project path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose MR revision bound at package creation */
  revision: string;
  /** @purpose Revision observed immediately before mutation */
  currentRevision: string;
  /** @purpose Provider web URL for host validation */
  mrUrl?: string;
  /** @purpose Comment, reply, request-changes, or description payload */
  body?: string;
  /** @purpose Discussion target for reply/resolve/reopen */
  discussionId?: string;
  /** @purpose Note target for reactions */
  noteId?: string;
  /** @purpose Emoji target for reactions */
  emoji?: string;
  /** @purpose Permission facts for the last pre-I/O gate */
  permission: VcsEffectPermission;
};

/** @purpose Native provider capabilities discovered without mutation. */
export type VcsCapabilities = {
  /** @purpose Whether native request-changes mutation and review-state read both exist */
  requestChanges: boolean;
  /** @purpose Evidence identifying the probe result */
  evidence: string;
};

/** @purpose Closed reconciled effect result; unknown never aliases success. */
export type VcsEffectOutcome = {
  /** @purpose Stable request identity */
  effectId: string;
  /** @purpose Original effect kind */
  kind: VcsEffectKind;
  /** @purpose Reconciled terminal or ambiguous state */
  status: 'applied' | 'no_op' | 'denied' | 'unavailable' | 'failed' | 'unknown';
  /** @purpose Provider or policy evidence supporting the classification */
  evidence: string;
  /** @purpose Whether an ambiguous transport was read before any retry */
  readBeforeRetry: boolean;
};

const EFFECT_KINDS = new Set<VcsEffectKind>([
  'comment',
  'reply',
  'react',
  'resolve',
  'reopen',
  'approve',
  'unapprove',
  'request_changes',
  'edit_description',
]);

/**
 * @purpose Reject unknown or incomplete provider mutations before any external I/O.
 * @param input Untrusted request candidate.
 * @throws {Error} When discriminator, identity, revision, permission, or kind payload is invalid.
 * @returns Validated closed request.
 */
export function validateVcsEffectRequest(input: unknown): VcsEffectRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('[validateVcsEffectRequest] Request must be an object');
  }
  const request = input as Record<string, unknown>;
  const requiredStrings = ['effectId', 'project', 'iid', 'revision', 'currentRevision'] as const;
  for (const field of requiredStrings) {
    if (typeof request[field] !== 'string' || request[field].length === 0) {
      throw new Error(`[validateVcsEffectRequest] ${field} must be a non-empty string`);
    }
  }
  if (!EFFECT_KINDS.has(request.kind as VcsEffectKind)) {
    throw new Error(`[validateVcsEffectRequest] Unsupported kind: ${String(request.kind)}`);
  }
  const permission = request.permission as Record<string, unknown> | undefined;
  if (
    !permission ||
    typeof permission.operatorLogin !== 'string' ||
    typeof permission.operatorIsMrAuthor !== 'boolean' ||
    typeof permission.reviewerPermission !== 'boolean' ||
    typeof permission.automatic !== 'boolean'
  ) {
    throw new Error('[validateVcsEffectRequest] permission facts are incomplete');
  }

  // #region START_VALIDATE_EFFECT_PAYLOAD_CLOSED_WORLD
  switch (request.kind as VcsEffectKind) {
    case 'comment':
    case 'request_changes':
    case 'edit_description':
      if (typeof request.body !== 'string' || request.body.trim().length === 0) {
        throw new Error(`[validateVcsEffectRequest] ${String(request.kind)} body is required`);
      }
      break;
    case 'reply':
      if (
        typeof request.body !== 'string' ||
        request.body.trim().length === 0 ||
        typeof request.discussionId !== 'string' ||
        request.discussionId.length === 0
      ) {
        throw new Error('[validateVcsEffectRequest] reply body and discussionId are required');
      }
      break;
    case 'react':
      if (
        typeof request.noteId !== 'string' ||
        request.noteId.length === 0 ||
        typeof request.emoji !== 'string' ||
        request.emoji.length === 0
      ) {
        throw new Error('[validateVcsEffectRequest] react noteId and emoji are required');
      }
      break;
    case 'resolve':
    case 'reopen':
      if (
        typeof request.discussionId !== 'string' ||
        request.discussionId.length === 0 ||
        typeof permission.threadAuthor !== 'string' ||
        permission.threadAuthor.length === 0
      ) {
        throw new Error(
          `[validateVcsEffectRequest] ${String(request.kind)} discussion ownership is required`
        );
      }
      break;
    case 'approve':
    case 'unapprove':
      break;
  }
  // #endregion END_VALIDATE_EFFECT_PAYLOAD_CLOSED_WORLD

  return request as VcsEffectRequest;
}

/** @purpose Result of compareSha — list of commits between two SHAs. */
export type CompareResult = {
  /** @purpose List of commit SHAs between from and to */
  commits: string[];
  /** @purpose Whether the provider returned the complete range. */
  complete: boolean;
  /** @purpose Provider evidence explaining the completeness result. */
  evidence: string;
};

/** @purpose Dedicated approval endpoint result with explicit completeness. */
export type VcsApprovalsResult = {
  /** @purpose Usernames that approved the MR. */
  approvedBy: string[];
  /** @purpose Required approval count when exposed by the provider. */
  approvalsRequired?: number;
  /** @purpose True only for a valid dedicated provider observation. */
  complete: boolean;
};

/** @purpose Pagination info for cursor-based discussion fetching. */
export type DiscussionsPageInfo = {
  /** @purpose Whether more pages exist after the current one */
  hasNextPage: boolean;
  /** @purpose Cursor for the next page; null when no more pages */
  endCursor: string | null;
};

/** @purpose One page of discussions with pagination metadata. */
export type DiscussionsPage = {
  /** @purpose Discussion threads in this page */
  discussions: VcsDiscussion[];
  /** @purpose Pagination metadata for next-page retrieval */
  pageInfo: DiscussionsPageInfo;
};

/** @purpose Provider-independent complete read boundary consumed by sync and reconciliation. */
export interface VcsReadPort {
  /**
   * @purpose Discover every open MR carrying an inclusive participation signal.
   * @returns Deduplicated actionable MRs.
   */
  getInbox(): Promise<VcsActionableMr[]>;
  /**
   * @purpose Read one complete immutable MR observation.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param [previous] Previous complete snapshot when available.
   * @returns Complete provider observation.
   */
  readSnapshot(project: string, iid: string, previous?: VcsSnapshot): Promise<VcsSnapshot>;
  /**
   * @purpose Probe mutation/read capabilities without creating an effect.
   * @returns Fresh provider capability evidence.
   */
  probeCapabilities(): Promise<VcsCapabilities>;
}

/** @purpose Provider-independent mutation primitives selected only after policy gates. */
export interface VcsEffectPort {
  /**
   * @purpose Post a new top-level discussion.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param body Discussion body.
   * @returns Completion after provider mutation.
   */
  postDiscussion(project: string, iid: string, body: string): Promise<void>;
  /**
   * @purpose Reply inside an existing discussion.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param body Reply body.
   * @param [discussionId] Existing discussion target.
   * @returns Completion after provider mutation.
   */
  postNote(project: string, iid: string, body: string, discussionId?: string): Promise<void>;
  /**
   * @purpose Add a note reaction.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param noteId Existing note target.
   * @param emoji Provider emoji name.
   * @returns Completion after provider mutation.
   */
  react(project: string, iid: string, noteId: string, emoji: string): Promise<void>;
  /**
   * @purpose Resolve an eligible discussion.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param discussionId Existing discussion target.
   * @returns Completion after provider mutation.
   */
  resolve(project: string, iid: string, discussionId: string): Promise<void>;
  /**
   * @purpose Reopen an eligible discussion.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param discussionId Existing discussion target.
   * @returns Completion after provider mutation.
   */
  reopen(project: string, iid: string, discussionId: string): Promise<void>;
  /**
   * @purpose Approve an eligible MR.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Completion after provider mutation.
   */
  approve(project: string, iid: string): Promise<void>;
  /**
   * @purpose Remove operator approval.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Completion after provider mutation.
   */
  unapprove(project: string, iid: string): Promise<void>;
  /**
   * @purpose Apply native requested-changes reviewer state.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Completion after provider mutation.
   */
  requestChanges(project: string, iid: string): Promise<void>;
  /**
   * @purpose Replace MR description.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param description Replacement Markdown.
   * @returns Completion after provider mutation.
   */
  editDescription(project: string, iid: string, description: string): Promise<void>;
}

/**
 * @purpose Existing unified VCS root combining independent read and effect contract surfaces.
 * @implements {VcsReadPort} in ./vcs-port.ts
 * @implements {VcsEffectPort} in ./vcs-port.ts
 * @invariant All network methods throw on failure; callers handle retry/backoff.
 * @invariant getHost is synchronous — used for SSRF validation of incoming URLs.
 * @consumer SyncService, Effects, BackgroundVerifier
 */
export abstract class VcsPort implements VcsReadPort, VcsEffectPort {
  /**
   * @purpose Fetch the authenticated user's VCS login — used by SyncService to resolve identity.
   * @returns Current user's login string.
   * @sideEffect Network: GET /user or equivalent identity endpoint.
   */
  abstract getCurrentUserLogin(): Promise<string>;

  /**
   * @purpose Fetch all merge requests awaiting the authenticated user's reaction.
   * @returns Deduplicated actionable MRs from the inbox.
   * @sideEffect Network: GitLab GraphQL (currentUser todos + MR connections)
   */
  abstract getInbox(): Promise<VcsActionableMr[]>;

  /**
   * @purpose Fetch enriched detail for a single MR by project and IID.
   * @returns Normalized MrDetail with poll-tier fields and CI status.
   * @sideEffect Network: GitLab REST GET /projects/:project/merge_requests/:iid
   */
  abstract getMrDetail(project: string, iid: string): Promise<MrDetail>;

  /**
   * @purpose Fetch discussion threads for an MR with cursor-based pagination.
   * @invariant Caller iterates pages via endCursor / hasNextPage until no more pages.
   * @param [cursor] Page cursor from previous page's pageInfo.endCursor; absent for first page.
   * @returns One page of discussions with pagination metadata.
   * @sideEffect Network: GitLab REST GET /projects/:project/merge_requests/:iid/discussions (paginated)
   */
  abstract getDiscussions(
    project: string,
    iid: string,
    cursor?: string | null
  ): Promise<DiscussionsPage>;

  /**
   * @purpose Compare two SHAs to detect new commits — used by background verification.
   * @returns List of commit SHAs between `from` and `to`.
   * @sideEffect Network: GitLab REST GET /projects/:project/repository/compare
   */
  abstract compareSha(
    project: string,
    iid: string,
    from: string,
    to: string
  ): Promise<CompareResult>;

  /**
   * @purpose Read approval truth from the provider's dedicated endpoint.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Approvers and explicit observation completeness.
   * @sideEffect Provider read only.
   */
  async getApprovals(project: string, iid: string): Promise<VcsApprovalsResult> {
    const detail = await this.getMrDetail(project, iid);
    return {
      approvedBy: [...detail.approvedBy],
      ...(detail.approvalsRequired === undefined
        ? {}
        : { approvalsRequired: detail.approvalsRequired }),
      complete: false,
    };
  }

  /**
   * @purpose Post a note to an MR — optionally within an existing discussion thread.
   * @param [discussionId] Reply to an existing thread; absent creates a new top-level discussion.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/discussions (or /notes)
   */
  abstract postNote(
    project: string,
    iid: string,
    body: string,
    discussionId?: string
  ): Promise<void>;

  /**
   * @purpose Post a note starting a new top-level discussion — alias to postNote without discussionId.
   * @sideEffect Network: POST new discussion on the MR.
   */
  abstract postDiscussion(project: string, iid: string, body: string): Promise<void>;

  /**
   * @purpose Add an emoji reaction to a note.
   * @sideEffect Network: POST to provider emoji reaction API.
   */
  abstract react(project: string, iid: string, noteId: string, emoji: string): Promise<void>;

  /**
   * @purpose Resolve a discussion thread — only own/robot threads in own MRs (D-323).
   * @throws When the thread belongs to a different author in a foreign MR.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid/discussions/:discussionId
   */
  abstract resolve(project: string, iid: string, discussionId: string): Promise<void>;

  /**
   * @purpose Approve a merge request.
   * @sideEffect Network: POST /projects/:project/merge_requests/:iid/approve
   */
  abstract approve(project: string, iid: string): Promise<void>;

  /**
   * @purpose Reopen one discussion through the same existing effect hierarchy.
   * @param _project Canonical project path.
   * @param _iid MR internal ID.
   * @param _discussionId Discussion target.
   * @throws {Error} When the concrete host adapter has not implemented reopen.
   * @returns Never for an unsupported adapter.
   */
  async reopen(_project: string, _iid: string, _discussionId: string): Promise<void> {
    throw new Error('[VcsPort#reopen] Native reopen is unsupported');
  }

  /**
   * @purpose Remove operator approval through the same existing effect hierarchy.
   * @param _project Canonical project path.
   * @param _iid MR internal ID.
   * @throws {Error} When the concrete host adapter has not implemented unapprove.
   * @returns Never for an unsupported adapter.
   */
  async unapprove(_project: string, _iid: string): Promise<void> {
    throw new Error('[VcsPort#unapprove] Native unapprove is unsupported');
  }

  /**
   * @purpose Apply provider-native requested-changes state without a comment/unapprove substitute.
   * @param _project Canonical project path.
   * @param _iid MR internal ID.
   * @throws {Error} When capability probing did not establish native support.
   * @returns Never for an unsupported adapter.
   */
  async requestChanges(_project: string, _iid: string): Promise<void> {
    throw new Error('[VcsPort#requestChanges] Native request changes is unsupported');
  }

  /**
   * @purpose Probe provider-native features without causing a mutation.
   * @returns Conservative unsupported capability for adapters without an explicit probe.
   */
  async probeCapabilities(): Promise<VcsCapabilities> {
    return { requestChanges: false, evidence: 'adapter-does-not-probe-request-changes' };
  }

  /**
   * @purpose Read native reviewer state for reconciliation.
   * @param _project Canonical project path.
   * @param _iid MR internal ID.
   * @returns Unknown when the adapter lacks native review-state telemetry.
   */
  async readReviewerState(_project: string, _iid: string): Promise<VcsReviewerState> {
    return 'unknown';
  }

  /**
   * @purpose Build one immutable complete observation from the existing detail/discussion/client primitives.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @param [previous] Previous complete snapshot used to derive commits.
   * @returns Complete observation whose cursor is safe to advance.
   * @sideEffect Reads identity, detail, discussion pages, compare, and native reviewer state.
   */
  async readSnapshot(project: string, iid: string, previous?: VcsSnapshot): Promise<VcsSnapshot> {
    const [operatorLogin, detail, reviewerState, approvals] = await Promise.all([
      this.getCurrentUserLogin(),
      this.getMrDetail(project, iid),
      this.readReviewerState(project, iid),
      this.getApprovals(project, iid),
    ]);
    const discussions: VcsDiscussion[] = [];
    let cursor: string | null = null;
    // #region START_READ_COMPLETE_DISCUSSION_OBSERVATION
    while (true) {
      const page = await this.getDiscussions(project, iid, cursor);
      discussions.push(...page.discussions);
      if (!page.pageInfo.hasNextPage) break;
      if (!page.pageInfo.endCursor) {
        throw new Error('[VcsPort#readSnapshot] Incomplete discussion pagination cursor');
      }
      cursor = page.pageInfo.endCursor;
    }
    // #endregion END_READ_COMPLETE_DISCUSSION_OBSERVATION

    const comparison =
      previous?.headSha && previous.headSha !== detail.headSha
        ? await this.compareSha(project, iid, previous.headSha, detail.headSha)
        : { commits: [], complete: true, evidence: 'comparison-not-required' };
    const state =
      detail.state === 'merged' ? 'merged' : detail.state === 'opened' ? 'open' : 'closed';
    const participation: VcsParticipation = {
      author: detail.author === operatorLogin,
      reviewer: detail.reviewers.includes(operatorLogin),
      assignee: detail.assignees?.includes(operatorLogin) ?? false,
      mentioned: discussions.some((discussion) =>
        discussion.notes.some((note) => note.body.includes(`@${operatorLogin}`))
      ),
      commented: discussions.some((discussion) =>
        discussion.notes.some((note) => note.author === operatorLogin)
      ),
      approved: approvals.approvedBy.includes(operatorLogin),
    };
    return Object.freeze({
      project,
      iid,
      webUrl: detail.webUrl,
      state,
      observedAt: detail.updatedAt,
      cursor: `${detail.updatedAt}:${detail.headSha}`,
      headSha: detail.headSha,
      commits: Object.freeze([...comparison.commits]),
      description: detail.description,
      participation: Object.freeze(participation),
      discussions: Object.freeze([...discussions]),
      approvedBy: Object.freeze([...approvals.approvedBy]),
      reviewerState,
      pipelineStatus: detail.pipelineStatus,
      completeness: Object.freeze({
        detail: true,
        discussions: true,
        approvals: approvals.complete,
        commits: comparison.complete,
        pipeline: true,
      }),
    }) as VcsSnapshot;
  }

  /**
   * @purpose Observe whether one desired effect already exists after ambiguous transport.
   * @param request Validated desired effect.
   * @returns Whether a fresh provider read proves the desired state.
   * @sideEffect Reads a fresh complete MR snapshot.
   */
  async observeEffect(request: VcsEffectRequest): Promise<boolean> {
    const snapshot = await this.readSnapshot(request.project, request.iid);
    // #region START_OBSERVE_EFFECT_POSTCONDITION_MATRIX
    switch (request.kind) {
      case 'comment':
      case 'reply':
        return snapshot.discussions.some((discussion) =>
          discussion.notes.some(
            (note) => note.author === request.permission.operatorLogin && note.body === request.body
          )
        );
      case 'react':
        return snapshot.discussions.some((discussion) =>
          discussion.notes.some(
            (note) => note.id === request.noteId && note.reactions?.includes(request.emoji ?? '')
          )
        );
      case 'resolve':
        return snapshot.discussions.some(
          (discussion) => discussion.id === request.discussionId && discussion.resolved
        );
      case 'reopen':
        return snapshot.discussions.some(
          (discussion) => discussion.id === request.discussionId && !discussion.resolved
        );
      case 'approve':
        return snapshot.approvedBy.includes(request.permission.operatorLogin);
      case 'unapprove':
        return !snapshot.approvedBy.includes(request.permission.operatorLogin);
      case 'request_changes':
        return (
          snapshot.reviewerState === 'requested_changes' && snapshot.headSha === request.revision
        );
      case 'edit_description':
        return snapshot.description === request.body;
    }
    // #endregion END_OBSERVE_EFFECT_POSTCONDITION_MATRIX
  }

  /**
   * @purpose Edit the description of a merge request.
   * @sideEffect Network: PUT /projects/:project/merge_requests/:iid
   */
  abstract editDescription(project: string, iid: string, description: string): Promise<void>;

  /**
   * @purpose VCS hostname (e.g. gitlab.example.com) for SSRF validation and deeplink construction.
   * @returns Configured VCS hostname; empty string when not configured.
   */
  abstract getHost(): string;
}
