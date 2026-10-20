// @file: ReviewFeedProjection — per-MR smart-widget feed projection result type.
// @spec: AGENT-INBOX-INBOX-INBOX-API
// @consumers: ProjectionPort, JournalProjectionAdapter, ReviewQueryRouter

import type { FeedProjectionResult } from '../dto/feed-widget.type.ts';

/** @purpose Per-MR smart-widget feed slice with unread counter. */
export type ReviewFeedProjection = FeedProjectionResult & {
  /** @purpose Unread event count since the operator's last-read cursor | @invariant >= 0 */
  unread: number;
};
