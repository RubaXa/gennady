// @file: ReviewBoardProjection — two-queue board projection result type (Mine / Assigned).
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter, review-board-projection.integration.test.ts
// @tasks: TSK-179

import type { AttentionState } from '../../inbox-vcs/attention.ts';

/** @purpose Responsibility queue for an MR on the two-queue board. */
export type ReviewQueue = 'mine' | 'assigned';

/** @purpose Participant role the operator holds on one MR — collected for deduplication. */
export type ReviewRoleChip = 'author' | 'reviewer' | 'assignee';

/**
 * @purpose Visibility lifecycle state of an MR in the board projection.
 * | @invariant active → shown in mine/assigned; completed/inactive → hidden from queues but history-queryable
 */
export type ReviewMrVisibility = 'active' | 'completed' | 'inactive';

/** @purpose Single deduplicated board card in the two-queue review board. */
export type ReviewBoardCard = {
  /** @purpose Composite MR reference (project!iid) | @invariant stable across lifecycle state changes */
  ref: string;
  /** @purpose Current MR title from the last VCS sync */
  title: string;
  /** @purpose VCS web URL */
  webUrl: string;
  /** @purpose MR author login */
  author: string;
  /** @purpose All roles the operator holds on this MR | @invariant non-empty; at least one role chip */
  roles: ReviewRoleChip[];
  /** @purpose Responsibility queue this card belongs to | @invariant mine when author chip present */
  queue: ReviewQueue;
  /** @purpose Computed attention state from the last VCS sync */
  attention: AttentionState;
  /** @purpose VCS lifecycle state */
  mrState: 'open' | 'merged' | 'closed';
  /** @purpose ISO timestamp of the last VCS or journal activity (horizon input) */
  lastActivity: string;
};

/** @purpose Two-queue board projection — closed-world visibility after lifecycle and horizon filtering. */
export type ReviewBoardProjection = {
  /** @purpose MR cards where the operator is the primary author */
  mine: ReviewBoardCard[];
  /** @purpose MR cards where the operator is reviewer or assignee (but not author) */
  assigned: ReviewBoardCard[];
  /** @purpose MR refs currently visible on the board (union of mine + assigned refs) */
  visible: string[];
  /** @purpose Journal cursor used for this projection build */
  cursor: number;
};
