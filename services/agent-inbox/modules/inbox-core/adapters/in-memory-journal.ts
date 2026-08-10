// @file: Deterministic in-memory implementation of the canonical and legacy JournalPort surfaces.
// @consumers: inbox-core contract tests, inbox-mocks
// @tasks: TSK-173

import type { JournalEntry, JournalPort, SinceResult } from '../event-journal.ts';
import { ReviewEvent } from '../types/review-event.type.ts';

/**
 * @purpose Preserve journal append/replay behavior in isolated deterministic memory.
 * @implements {JournalPort} in ../event-journal.ts
 * @invariant Returned entries/events are copies and cannot mutate acknowledged journal state.
 */
export class InMemoryJournal implements JournalPort {
  /** @see {JournalPort#identity} in ../event-journal.ts */
  readonly identity = 'in-memory-journal';

  /** @see {JournalPort#health} in ../event-journal.ts */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /** @purpose Legacy journal entries retained for compatibility consumers. */
  protected _entries: JournalEntry[] = [];
  /** @purpose Canonical validated review events retained for deterministic replay. */
  protected _reviewEvents: ReviewEvent[] = [];

  /** @see {JournalPort#append} in ../event-journal.ts */
  async append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    const seq = this._entries.length + 1;
    this._entries.push({ ...entry, seq });
    return seq;
  }

  /** @see {JournalPort#read} in ../event-journal.ts */
  read(): JournalEntry[] {
    return this._entries.map((entry) => ({ ...entry }));
  }

  /** @see {JournalPort#since} in ../event-journal.ts */
  since(cursor: number): SinceResult {
    const entries = this._entries.filter((entry) => entry.seq > cursor);
    return { entries, nextCursor: this._entries.at(-1)?.seq ?? cursor };
  }

  /** @see {JournalPort#appendReviewEvent} in ../event-journal.ts */
  async appendReviewEvent(event: ReviewEvent): Promise<number> {
    this._reviewEvents.push(ReviewEvent.validate(event.toJSON()));
    return this._reviewEvents.length;
  }

  /** @see {JournalPort#replayReviewEvents} in ../event-journal.ts */
  replayReviewEvents(): ReviewEvent[] {
    return this._reviewEvents.map((event) => ReviewEvent.validate(event.toJSON()));
  }
}
