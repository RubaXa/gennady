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
  /** @purpose VCS author login. */
  author: string;
  /** @purpose Authenticated operator role for this MR, null when VCS cannot determine it. */
  myRole: string | null;
  /** @purpose Computed attention group. */
  attention: AttentionState;
  /** @purpose Aggregated dashboard badges. */
  counters: {
    approvals: string;
    reviewers: { user: string; voted: boolean }[];
    ci: string | null;
    threads: string;
    awaitingMe: number;
    newCommits: number;
    unread: number;
  };
  /** @purpose Durable task work state for the MR. */
  work: MrWork;
};
