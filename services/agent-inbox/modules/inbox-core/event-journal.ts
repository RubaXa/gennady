// @file: EventJournal — append-only JSONL journal: per-MR monotonic seq, O_APPEND+fsync, broken-tail recovery, global system journal
// @consumers: inbox-core services, queue, pipeline, chat, api
// @tasks: TSK-156, TSK-173

import {
  existsSync,
  mkdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  readFileSync,
  truncateSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '#logger';
import { ReviewEvent } from './types/review-event.type.ts';

/** @purpose Closed set of 10 event kinds — drives payload shape and producer routing */
export type EventKind =
  | 'task_created'
  | 'task_status'
  | 'artifact_produced'
  | 'gitlab_event'
  | 'widget_bump'
  | 'proposal'
  | 'decision'
  | 'chat_turn'
  | 'mutation'
  | 'system';

/** @purpose Single event envelope — kind-specific data lives inside payload */
export type JournalEntry = {
  /** @purpose ISO 8601 timestamp of the event */
  ts: string;
  /** @purpose Monotonic per-MR sequence number */
  seq: number;
  /** @purpose MR ref (path!iid) or 'system' for global events */
  mr: string;
  /** @purpose Event kind — closed set of 10 values */
  kind: EventKind;
  /** @purpose Producer identifier (queue, pipeline, chat, api, core) */
  actor?: string;
  /** @purpose Kind-specific payload */
  payload?: Record<string, unknown>;
};

/** @purpose Paginated result from since(cursor) — entries with seq > cursor plus next cursor position */
export type SinceResult = {
  /** @purpose Entries newer than cursor, in append order */
  entries: JournalEntry[];
  /** @purpose Highest seq in the journal at call time — pass to next since() */
  nextCursor: number;
};

/**
 * @purpose Contract for event journal — append-only JSONL with monotonic seq per MR
 * @invariant Per-MR: in-process serialization — one writer at a time
 * @invariant O_APPEND + fsync per line; broken tail transparently discarded on read
 */
export interface JournalPort {
  /** @purpose Stable adapter identity exposed to runtime diagnostics. */
  readonly identity: string;

  /**
   * @purpose Report the latest observable durable-storage health.
   * @returns Current adapter health and optional failure detail.
   */
  health(): { status: 'healthy' | 'failed'; detail?: string };

  /**
   * @purpose Append one event, assigning the next monotonic seq (per-MR)
   * @param entry Event envelope without seq
   * @throws When the write fails
   * @returns Assigned seq after fsync
   * @sideEffect Writes one JSON line to disk with O_APPEND + fsync
   */
  append(entry: Omit<JournalEntry, 'seq'>): Promise<number>;

  /**
   * @purpose Read all journal entries from disk, discarding any broken tail
   * @returns Parsed entries in append order
   */
  read(): JournalEntry[];

  /**
   * @purpose Read entries with seq > cursor for incremental feed consumption
   * @param cursor Last consumed seq (0 to start from beginning)
   * @returns Newer entries and the next cursor for subsequent calls
   */
  since(cursor: number): SinceResult;

  /**
   * @purpose Durably append one validated canonical review event.
   * @param event Canonical versioned event.
   * @throws {Error} When validation or durable append fails.
   * @returns Assigned monotonic journal sequence after fsync.
   * @sideEffect Writes one JSON line to the journal.
   */
  appendReviewEvent(event: ReviewEvent): Promise<number>;

  /**
   * @purpose Replay canonical review events and reject unsupported versions or kinds visibly.
   * @throws {Error} When a complete journal record is not a supported ReviewEvent.
   * @returns Validated events in append order after torn-tail recovery.
   */
  replayReviewEvents(): ReviewEvent[];
}

/**
 * @purpose Append-only JSONL event journal with O_APPEND+fsync and per-MR monotonic seq
 * @implements {JournalPort}
 * @invariant Seq restored from disk on construction — restarts never reuse seq numbers
 * @invariant Per-line fsync — committed write survives process crash
 * @invariant Broken tail (partial line after crash) is discarded on read — journal remains appendable
 */
export class EventJournal implements JournalPort {
  /** @purpose Stable production adapter identity. */
  readonly identity = 'local-event-journal';
  /** @purpose Absolute path to the JSONL file */
  protected _filePath: string;
  /** @purpose Highest seq seen — restored from disk on construction, incremented on each append */
  protected _lastSeq: number;
  /** @purpose Promise chain for serializing writes — only one fsync in flight at a time */
  protected _writeChain: Promise<void>;
  /** @purpose Latest observed durable adapter failure, cleared after successful writes. */
  protected _healthFailure: string | null = null;

  /** @see {JournalPort#health} */
  health(): { status: 'healthy' | 'failed'; detail?: string } {
    return this._healthFailure
      ? { status: 'failed', detail: this._healthFailure }
      : { status: 'healthy' };
  }

  /**
   * @purpose Open an event journal at the given file path
   * @param filePath Path to events.jsonl
   * @sideEffect Creates parent directories; reads existing file to restore max seq
   */
  constructor(filePath: string) {
    this._filePath = filePath;
    this._writeChain = Promise.resolve();
    this._ensureDir();
    this._lastSeq = this._scanMaxSeq();
    logger.debug('[EventJournal#constructor] [init → ready]', { filePath, lastSeq: this._lastSeq });
  }

  /** @see {JournalPort#append} */
  append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this._writeChain = this._writeChain.then(() => {
        try {
          this._lastSeq += 1;
          const seq = this._lastSeq;
          const full: JournalEntry = { ...entry, seq };
          this._writeLine(full);
          this._healthFailure = null;
          logger.debug('[EventJournal#append] [writing → written]', {
            seq,
            mr: entry.mr,
            kind: entry.kind,
          });
          resolve(seq);
        } catch (cause) {
          this._lastSeq -= 1;
          const error = new Error('[EventJournal#append] Write failed', { cause });
          this._healthFailure = error.message;
          logger.error('[EventJournal#append] [writing → failed]', {
            error,
            filePath: this._filePath,
          });
          reject(error);
        }
      });
    });
  }

  /** @see {JournalPort#read} */
  read(): JournalEntry[] {
    return this._readEntries();
  }

  /** @see {JournalPort#since} */
  since(cursor: number): SinceResult {
    const all = this._readEntries();
    const entries = all.filter((e) => e.seq > cursor);
    const nextCursor = all.length > 0 ? all[all.length - 1].seq : cursor;
    return { entries, nextCursor };
  }

  /** @see {JournalPort#appendReviewEvent} */
  appendReviewEvent(event: ReviewEvent): Promise<number> {
    const canonical = ReviewEvent.validate(event.toJSON());
    return new Promise<number>((resolve, reject) => {
      this._writeChain = this._writeChain.then(() => {
        // #region START_DURABLE_CANONICAL_APPEND
        try {
          this._lastSeq += 1;
          const seq = this._lastSeq;
          this._writeLine({ ...canonical.toJSON(), seq });
          this._healthFailure = null;
          logger.debug('[EventJournal#appendReviewEvent] [writing → written]', {
            seq,
            mr: canonical.identifyMr(),
            kind: canonical.kind,
          });
          resolve(seq);
        } catch (cause) {
          this._lastSeq -= 1;
          const error = new Error('[EventJournal#appendReviewEvent] Durable append failed', {
            cause,
          });
          this._healthFailure = error.message;
          logger.error('[EventJournal#appendReviewEvent] [writing → failed]', { error });
          reject(error);
        }
        // #endregion END_DURABLE_CANONICAL_APPEND
      });
    });
  }

  /** @see {JournalPort#replayReviewEvents} */
  replayReviewEvents(): ReviewEvent[] {
    const entries = this._readEntries();
    // #region START_REJECT_UNSUPPORTED_CANONICAL_RECORDS_VISIBLY
    try {
      return entries.map((entry) => ReviewEvent.validate(entry));
    } catch (cause) {
      const error = new Error(
        '[EventJournal#replayReviewEvents] Unsupported complete journal record quarantined',
        { cause }
      );
      logger.error('[EventJournal#replayReviewEvents] [replaying → rejected]', { error });
      throw error;
    }
    // #endregion END_REJECT_UNSUPPORTED_CANONICAL_RECORDS_VISIBLY
  }

  /**
   * @purpose Create parent directories for the journal file
   * @sideEffect mkdirSync recursive
   */
  protected _ensureDir(): void {
    const dir = dirname(this._filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * @purpose Scan the existing journal file to find the highest seq
   * @returns Max seq found; 0 if file absent or empty
   */
  protected _scanMaxSeq(): number {
    const entries = this._readEntries();
    if (entries.length === 0) return 0;
    return entries[entries.length - 1].seq;
  }

  /**
   * @purpose Read all whole entries from the JSONL file, discarding an unterminated crash tail
   * @returns Parsed entries; empty array when file absent or unreadable
   * @sideEffect Removes only an unterminated final line before a later append can merge into it
   */
  protected _readEntries(): JournalEntry[] {
    if (!existsSync(this._filePath)) return [];
    try {
      const raw = this._discardUnterminatedTail(readFileSync(this._filePath, 'utf8'));
      const entries: JournalEntry[] = [];
      // #region START_PARSE_LINES — invariant: corrupt line is skipped with an error log (never silently); valid entries after a torn write stay visible (multi-process writers can corrupt mid-file)
      for (const [index, line] of raw.split('\n').entries()) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as JournalEntry);
        } catch {
          logger.error('[EventJournal#read] [parsing → corrupt_line_skipped]', {
            filePath: this._filePath,
            line: index + 1,
          });
        }
      }
      // #endregion END_PARSE_LINES
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * @purpose Remove a torn final JSONL line left without its terminating newline
   * @param raw Current journal contents
   * @returns Contents containing only complete newline-terminated records
   * @sideEffect Truncates the file to the last newline when a crash tail is found
   */
  protected _discardUnterminatedTail(raw: string): string {
    if (raw.length === 0 || raw.endsWith('\n')) return raw;

    const completeLength = raw.lastIndexOf('\n') + 1;
    truncateSync(this._filePath, completeLength);
    logger.error('[EventJournal#read] [replaying → unterminated_tail_discarded]', {
      filePath: this._filePath,
      discardedBytes: raw.length - completeLength,
    });
    return raw.slice(0, completeLength);
  }

  /**
   * @purpose Write a single JSON line with O_APPEND + fsync
   * @param entry Complete journal entry
   * @sideEffect Appends one JSON line + fsync to the journal file
   */
  protected _writeLine(entry: unknown): void {
    const line = JSON.stringify(entry) + '\n';
    // #region START_APPEND_FSYNC — invariant: O_APPEND + fsync guarantees durability; each line is one write call
    const fd = openSync(this._filePath, 'a');
    try {
      writeSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // #endregion END_APPEND_FSYNC
  }
}
