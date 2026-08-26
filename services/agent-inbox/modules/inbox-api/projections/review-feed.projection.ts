// @file: ReviewFeedProjection — per-MR smart-widget feed projection result type.
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter
// @tasks: TSK-179

import type { FeedProjectionResult } from '../dto/feed-widget.type.ts';

/** @purpose Per-MR smart-widget feed slice with unread counter. */
export type ReviewFeedProjection = FeedProjectionResult & {
  /** @purpose Unread event count since the operator's last-read cursor | @invariant >= 0 */
  unread: number;
};
