// @file: ProjectionPort — transport-neutral abstraction for building all review state views.
// @consumers: JournalProjectionAdapter, ReviewQueryRouter, test adapters
// @tasks: TSK-179

import type { ReviewBoardProjection } from './review-board.projection.ts';
import type { ReviewFeedProjection } from './review-feed.projection.ts';
import type { ReviewMrProjection } from './review-mr.projection.ts';
import type { ReviewPackageProjection } from './review-package.projection.ts';
import type { ReviewTestRunProjection } from './review-test-run.projection.ts';

/**
 * @purpose Transport-neutral abstraction for building all review state views from canonical events and sync state.
 * @invariant All methods are pure reads — no mutations, no side effects.
 * @invariant Absent MR → board projection returns empty queues; mr() returns null; others return empty collections with cursor=0.
 */
export interface ProjectionPort {
  /**
   * @purpose Build the two-queue board view — Mine and Assigned, with deduplication and visibility filtering.
   * @returns ReviewBoardProjection with unique MR cards per queue.
   */
  board(): ReviewBoardProjection;

  /**
   * @purpose Project per-MR smart-widget feed entries since a cursor.
   * @param mrRef Composite MR reference (project!iid).
   * @param cursor Feed cursor from a prior call; 0 to start from the beginning.
   * @returns Feed slice with widgets, next cursor, and unread count.
   */
  feed(mrRef: string, cursor: number): ReviewFeedProjection;

  /**
   * @purpose Project the complete MR workspace state — report, artifacts, and verdict.
   * @param mrRef Composite MR reference (project!iid).
   * @returns ReviewMrProjection when the MR is known to this adapter; null otherwise.
   */
  mr(mrRef: string): ReviewMrProjection | null;

  /**
   * @purpose Project current and stale action packages for an MR.
   * @param mrRef Composite MR reference (project!iid).
   * @returns Package projection with actionable (current) and invalidated (stale) package lists.
   */
  packages(mrRef: string): ReviewPackageProjection;

  /**
   * @purpose Project adaptive test status and observed preconditions for an MR.
   * @param mrRef Composite MR reference (project!iid).
   * @returns Test run projection with status and ordered run history.
   */
  testRun(mrRef: string): ReviewTestRunProjection;

  /**
   * @purpose Return the journal cursor at the last projection build.
   * @returns Highest journal seq seen at the last build; 0 before any build.
   */
  cursor(): number;
}
