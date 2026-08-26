// @file: Durable/volatile JournalPort adapters owned by PipelineRuntime — test seam plus control-plane state records.
// @consumers: PipelineRuntime
// @tasks: TSK-157, TSK-173

import type { JournalEntry, JournalPort } from '../../inbox-core/event-journal.ts';
import { ReviewEvent } from '../../inbox-core/types/review-event.type.ts';
import type { ReviewManifestKey } from '../types/review-intent.type.ts';
import {
  type ReviewRepairJournal,
  type ReviewRepairState,
} from '../completeness/review-repair-coordinator.ts';
import {
  type ReviewFreshnessJournal,
  type ReviewFreshnessPurpose,
  type ReviewGuardedTransition,
} from '../verification/review-freshness-gate.ts';

/** @purpose Test-only journal preserving the Executor seam for pure DAG materialization. */
export class VolatileJournal implements JournalPort {
  /** @purpose Stable adapter identity distinguishing this seam from durable production journals. */
  readonly identity = 'volatile-pipeline-journal';
  /** @purpose In-memory generic journal entries, sequenced from one. */
  protected _entries: JournalEntry[] = [];
  /** @purpose In-memory canonical review events appended so far. */
  protected _reviewEvents: ReviewEvent[] = [];

  /**
   * @purpose Report the journal as healthy — no external durability to fail.
   * @returns Constant healthy status.
   */
  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  /**
   * @purpose Append one entry, assigning the next in-memory sequence number.
   * @param entry Entry without its sequence number.
   * @returns Assigned sequence number.
   */
  async append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    const seq = this._entries.length + 1;
    this._entries.push({ ...entry, seq });
    return seq;
  }

  /**
   * @purpose Return every entry appended so far.
   * @returns All in-memory entries.
   */
  read(): JournalEntry[] {
    return this._entries;
  }

  /**
   * @purpose Return entries appended after the given cursor.
   * @param cursor Exclusive lower-bound sequence number.
   * @returns Entries after the cursor and the new cursor position.
   */
  since(cursor: number): { entries: JournalEntry[]; nextCursor: number } {
    const entries = this._entries.filter((entry) => entry.seq > cursor);
    return { entries, nextCursor: this._entries.at(-1)?.seq ?? cursor };
  }

  /**
   * @purpose Append one canonical review event, assigning the next in-memory sequence number.
   * @param event Review event to append.
   * @returns Assigned sequence number.
   */
  async appendReviewEvent(event: ReviewEvent): Promise<number> {
    this._reviewEvents.push(ReviewEvent.validate(event.toJSON()));
    return this._reviewEvents.length;
  }

  /**
   * @purpose Return every canonical review event appended so far.
   * @returns All in-memory canonical review events.
   */
  replayReviewEvents(): ReviewEvent[] {
    return this._reviewEvents.map((event) => ReviewEvent.validate(event.toJSON()));
  }
}

/** @purpose Durable state adapter for one review round stored outside canonical review events. */
export class EventReviewRepairJournal implements ReviewRepairJournal {
  /** @purpose Durable generic control-plane journal owning persisted repair state. */
  protected readonly _journal: JournalPort;
  /** @purpose Manifest identity scoping this journal's repair state. */
  protected readonly _key: ReviewManifestKey;
  /** @purpose Round identity scoping this journal's repair state. */
  protected readonly _roundId: string;
  /** @purpose Maximum repair attempts before escalation. */
  protected readonly _maxAttempts: number;

  /**
   * @purpose Bind the repair journal to its owning generic journal, manifest key, and round.
   * @param journal Durable generic control-plane journal.
   * @param key Manifest identity scoping repair state.
   * @param roundId Round identity scoping repair state.
   * @param [maxAttempts] Maximum repair attempts before escalation.
   */
  constructor(journal: JournalPort, key: ReviewManifestKey, roundId: string, maxAttempts = 3) {
    this._journal = journal;
    this._key = key;
    this._roundId = roundId;
    this._maxAttempts = maxAttempts;
  }

  /**
   * @purpose Read the last persisted repair state for this manifest key and round.
   * @returns Persisted state, or a fresh zero-attempt state when none exists.
   */
  async retrieve(): Promise<ReviewRepairState> {
    const state = this._journal
      .read()
      .filter(
        (entry) =>
          entry.kind === 'system' &&
          entry.mr === this._key.mr &&
          entry.actor === 'review-control-plane' &&
          entry.payload?.event === 'repair_state' &&
          entry.payload?.roundId === this._roundId &&
          JSON.stringify(entry.payload?.manifestKey) === JSON.stringify(this._key)
      )
      .at(-1)?.payload?.state;
    if (this._isRepairState(state)) return state;
    return { roundId: this._roundId, attempt: 0, maxAttempts: this._maxAttempts, provenance: [] };
  }

  /**
   * @purpose Persist one repair state transition.
   * @param state State to persist.
   * @returns Promise resolving after the repair state is durably persisted.
   */
  async persist(state: ReviewRepairState): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: this._key.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: { event: 'repair_state', manifestKey: this._key, roundId: this._roundId, state },
    });
  }

  /**
   * @purpose Narrow a persisted payload value to a valid repair state for this round.
   * @param value Candidate persisted payload value.
   * @returns Whether the value is a valid repair state for this round.
   */
  protected _isRepairState(value: unknown): value is ReviewRepairState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate.roundId === this._roundId &&
      typeof candidate.attempt === 'number' &&
      typeof candidate.maxAttempts === 'number' &&
      Array.isArray(candidate.provenance)
    );
  }
}

/** @purpose Durable per-MR freshness transitions stored in the generic control-plane journal. */
export class EventReviewFreshnessJournal implements ReviewFreshnessJournal {
  /** @purpose Durable generic control-plane journal owning persisted freshness transactions. */
  protected readonly _journal: JournalPort;

  /**
   * @purpose Bind the freshness journal to its owning generic journal.
   * @param journal Durable generic control-plane journal.
   */
  constructor(journal: JournalPort) {
    this._journal = journal;
  }

  /**
   * @purpose Persist one freshness guard transaction outcome.
   * @param purpose Guard purpose being recorded.
   * @param key Manifest identity scoping the transaction.
   * @param observedRevision Revision observed at guard time.
   * @param [transition] Guarded transition payload when the guard matched.
   * @returns Promise resolving after the guard transaction is durably persisted.
   */
  async recordGuardTransaction(
    purpose: ReviewFreshnessPurpose,
    key: ReviewManifestKey,
    observedRevision: string,
    transition?: ReviewGuardedTransition
  ): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: key.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: {
        event: 'freshness_guard_transaction',
        purpose,
        key,
        observedRevision,
        comparison: transition ? 'MATCH' : 'STALE',
        transition,
        deltaRequested: transition ? false : true,
      },
    });
  }
}
