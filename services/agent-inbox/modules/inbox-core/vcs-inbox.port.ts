// @file: VcsInboxPort — VCS integration abstraction: actionable MRs, MR context, discussions.
// @consumers: inbox-api, inbox-roles, inbox-dashboard, CLI
// @tasks: TSK-110

import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose Normalized MR context returned by getMrContext — metadata only, no worktree-specific data. */
export type MrContext = {
  /** @purpose Project full path (e.g. group/subgroup/project) */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string;
  /** @purpose MR web URL */
  webUrl: string;
  /** @purpose MR title */
  title: string;
  /** @purpose Source branch name */
  sourceBranch: string;
  /** @purpose Target branch name */
  targetBranch: string;
  /** @purpose ISO timestamp of MR creation */
  createdAt: string;
  /** @purpose ISO timestamp of last MR update */
  updatedAt: string;
  /** @purpose MR author username */
  author: string;
  /** @purpose Assigned reviewer usernames */
  reviewers: string[];
  /** @purpose Usernames who approved the MR */
  approvedBy: string[];
  /** @purpose MR description (may be empty) */
  description: string;
  /** @purpose My role relative to this MR (reviewer | author | mentioned | null) */
  myRole: string | null;
};

/**
 * @purpose Options for fetching MR discussions.
 * @consumer VcsInboxPort.getDiscussions
 */
export type DiscussionOpts = {
  /** @purpose Include resolved discussions (default: false — only unresolved) */
  all?: boolean;
  /** @purpose Filter discussions involving the current user only */
  my?: boolean;
  /** @purpose Include draft notes (requires `my: true`) */
  withDrafts?: boolean;
};

/** @purpose Single note within a discussion thread. */
export type DiscussionNote = {
  /** @purpose GitLab note ID */
  id: string;
  /** @purpose Note author display name */
  author: string;
  /** @purpose Note author username (GitLab-specific) */
  username?: string;
  /** @purpose Note body text in Markdown */
  body: string;
  /** @purpose ISO timestamp of note creation */
  createdAt: string;
};

/** @purpose Normalized discussion thread from an MR. */
export type Discussion = {
  /** @purpose GitLab discussion ID */
  id: string;
  /** @purpose Shortened ID for display (first 8 chars) */
  shortId: string;
  /** @purpose Author of the first note in the thread */
  author: string;
  /** @purpose First note body text */
  body: string;
  /** @purpose File path for line-level discussions */
  file?: string;
  /** @purpose Line number for line-level discussions */
  line?: number;
  /** @purpose Whether the thread is resolved */
  resolved: boolean | null;
  /** @purpose All notes in this thread, oldest first */
  notes: DiscussionNote[];
};

/**
 * @purpose Abstraction of VCS access for the agent-inbox domain.
 * @invariant Mock is deterministic (pure in-memory); Real is network-backed without caching.
 * @invariant Both Mock and Real return the same types — consumers are indifferent to the backing.
 * @consumer inbox-api, inbox-roles, inbox-dashboard
 */
export abstract class VcsInboxPort {
  /**
   * @purpose Fetch all merge requests awaiting the authenticated user's reaction.
   * @returns Deduplicated actionable MRs; empty array when nothing requires attention.
   */
  abstract getActionable(): Promise<VcsActionableMr[]>;

  /**
   * @purpose Fetch full context for a single MR by its web URL.
   * @param webUrl MR web URL (e.g. https://gitlab.example.com/group/proj/-/merge_requests/42).
   * @returns MR metadata — project, title, branches, author, reviewers, etc.
   */
  abstract getMrContext(webUrl: string): Promise<MrContext>;

  /**
   * @purpose Fetch discussion threads for a single MR.
   * @param webUrl MR web URL.
   * @param opts Filtering options: all (include resolved), my (my threads only), withDrafts.
   * @returns Normalized discussion threads.
   */
  abstract getDiscussions(webUrl: string, opts?: DiscussionOpts): Promise<Discussion[]>;

  /**
   * @purpose VCS hostname (e.g. gitlab.example.com) — used for MR URL validation.
   * @returns Configured VCS hostname; empty string when not configured (mock/dev mode).
   */
  abstract getHost(): string;

  /**
   * @purpose Authenticated user login — used by AI-02 noise filter.
   * @returns Login string; empty when identity is unavailable (filter degrades gracefully).
   */
  async getMyLogin(): Promise<string> {
    return '';
  }
}
