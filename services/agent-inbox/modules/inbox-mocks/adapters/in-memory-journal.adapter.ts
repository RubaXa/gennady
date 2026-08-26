// @file: InMemoryJournalAdapter — isolated in-memory journal implementing JournalPort without filesystem I/O.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import type { JournalPort, JournalEntry, SinceResult } from '../../inbox-core/event-journal.ts';
import { ReviewEvent } from '../../inbox-core/types/review-event.type.ts';

/**
 * @purpose Deterministic in-memory journal for isolated test scenarios without any filesystem side effects.
 * @implements {JournalPort} in ../../inbox-core/event-journal.ts
 * @invariant Per-MR monotonic seq is maintained across appends within one instance lifetime.
 * @invariant No network or filesystem fallback exists — absent data fails the scenario.
 */
export class InMemoryJournalAdapter implements JournalPort {
  /** @see {JournalPort#identity} in ../../inbox-core/event-journal.ts */
  readonly identity = 'in-memory-journal';

  /** @purpose Accumulated entries in append order. */
  protected _entries: JournalEntry[] = [];
  /** @purpose Last assigned monotonic sequence number. */
  protected _lastSeq = 0;
  /** @purpose Serialization promise chain for deterministic append order. */
  protected _writeChain: Promise<void> = Promise.resolve();

  /** @see {JournalPort#health} in ../../inbox-core/event-journal.ts */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /** @see {JournalPort#append} in ../../inbox-core/event-journal.ts */
  append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    return new Promise<number>((resolve) => {
      this._writeChain = this._writeChain.then(() => {
        this._lastSeq += 1;
        const full: JournalEntry = { ...entry, seq: this._lastSeq };
        this._entries.push(full);
        resolve(this._lastSeq);
      });
    });
  }

  /** @see {JournalPort#read} in ../../inbox-core/event-journal.ts */
  read(): JournalEntry[] {
    return [...this._entries];
  }

  /** @see {JournalPort#since} in ../../inbox-core/event-journal.ts */
  since(cursor: number): SinceResult {
    const entries = this._entries.filter((e) => e.seq > cursor);
    const nextCursor =
      this._entries.length > 0 ? this._entries[this._entries.length - 1].seq : cursor;
    return { entries, nextCursor };
  }

  /** @see {JournalPort#appendReviewEvent} in ../../inbox-core/event-journal.ts */
  appendReviewEvent(event: ReviewEvent): Promise<number> {
    const canonical = ReviewEvent.validate(event.toJSON());
    return this.append({ ...canonical.toJSON() } as Omit<JournalEntry, 'seq'>);
  }

  /** @see {JournalPort#replayReviewEvents} in ../../inbox-core/event-journal.ts */
  replayReviewEvents(): ReviewEvent[] {
    return this._entries.map((entry) => ReviewEvent.validate(entry));
  }

  /**
   * @purpose Discard all entries and reset seq counter — resets only this owned instance.
   * @sideEffect Clears all in-memory state.
   */
  reset(): void {
    this._entries = [];
    this._lastSeq = 0;
    this._writeChain = Promise.resolve();
  }
}
