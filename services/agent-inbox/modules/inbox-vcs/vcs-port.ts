// @file: VcsPort — contract surface for GitLab truth layer: 12 methods covering inbox, detail, discussions, compare, effects, host validation, and identity.
// @consumers: SyncService, Effects, BackgroundVerifier
// @tasks: TSK-158

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
  /** @purpose MR description in Markdown */
  description: string;
  /** @purpose MR author username */
  author: string;
  /** @purpose Assigned reviewer usernames */
  reviewers: string[];
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
};

/** @purpose Result of compareSha — list of commits between two SHAs. */
export type CompareResult = {
  /** @purpose List of commit SHAs between from and to */
  commits: string[];
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

/**
 * @purpose Abstraction of VCS access for the inbox-vcs truth layer — wraps vcs-client primitives.
 * @invariant All network methods throw on failure; callers handle retry/backoff.
 * @invariant getHost is synchronous — used for SSRF validation of incoming URLs.
 * @consumer SyncService, Effects, BackgroundVerifier
 */
export abstract class VcsPort {
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
