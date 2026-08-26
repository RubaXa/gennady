// @file: MrCard DTO — canonical board-card contract projected from SyncSnapshot + EventJournal.
// @consumers: BoardProjection, StateRouter, inbox-dashboard
// @tasks: TSK-162

import type { AttentionState } from '../../inbox-vcs/attention.ts';

/** @purpose Canonical MR identity used in board attention groups. */
export type MrRef = string;

/** @purpose Durable work state shown on the board; `idle` means no task has been recorded for the MR. */
export type MrWorkState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting_dep'
  | 'done'
  | 'failed'
  | 'cancelled';

/** @purpose Current work derived exclusively from task events in the durable event journal. */
export type MrWork = {
  /** @purpose Last recorded task status, or idle before any task event. */
  state: MrWorkState;
  /** @purpose Human-readable work label; task type when known, otherwise a state label. */
  label: string;
  /** @purpose Task whose latest durable status defines this work state. */
  taskId?: string;
  /** @purpose Timestamp of the latest running transition, null until work has started. */
  startedAt: string | null;
};

/** @purpose Canonical attention-grouped card returned by GET /api/board and GET /api/state. */
export type MrCard = {
  /** @purpose Composite MR reference (`project!iid`) used by all v2 API routes. */
  ref: string;
  /** @purpose Current title from the synchronized VCS snapshot. */
  title: string;
  /** @purpose MR description body from the VCS snapshot (may be long — UI clamps). */
  description: string;
  /** @purpose Canonical VCS web URL for the GitLab ↗ link. */
  webUrl: string;
  /** @purpose VCS author login. */
  author: string;
  /** @purpose Authenticated operator role for this MR, null when VCS cannot determine it. */
  myRole: string | null;
  /** @purpose Computed attention group. */
  attention: AttentionState;
  /** @purpose Operator-specific review facts used for truthful role-aware action labels. */
  review?: {
    /** @purpose Operator currently approved the MR. */
    approvedByMe: boolean;
    /** @purpose Operator left at least one review discussion note. */
    commentedByMe: boolean;
    /** @purpose GitLab explicitly removed the operator's previous approval. */
    approvalReset: boolean;
    /** @purpose A canonical review artifact exists for this MR on disk. */
    selfReviewCompleted: boolean;
  };
  /** @purpose Observable automatic-review timer derived from the latest head commit. */
  autoReview?: {
    /** @purpose Runtime policy state for this server process. */
    state: 'scheduled' | 'due' | 'running' | 'complete' | 'frozen' | 'unknown_commit_time';
    /** @purpose Whether discovery-triggered review dispatch is enabled. */
    enabled: boolean;
    /** @purpose Configured quiet window in milliseconds. */
    quietMs: number;
    /** @purpose Current head commit time, or null when GitLab did not expose it. */
    lastCommitAt: string | null;
    /** @purpose Scheduled dispatch instant, or null without a commit timestamp. */
    dueAt: string | null;
  };
  /** @purpose Aggregated dashboard badges. */
  counters: {
    approvals: string;
    reviewers: { user: string; voted: boolean }[];
    ci: string | null;
    threads: string;
    awaitingMe: number;
    newCommits: number;
    /** @purpose Findings in the latest materialized review, absent before disk enrichment. */
    findings?: number;
    unread: number;
  };
  /** @purpose Durable task work state for the MR. */
  work: MrWork;
};
