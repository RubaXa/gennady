// @file: FindingsJournal — append-only findings.jsonl, each finding: F-n with file:line, summary, severity, source:model
// @consumers: Synthesize, inbox-pipeline
// @tasks: TSK-161

import {
  existsSync,
  mkdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  readFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '#logger';

/** @purpose Severity of a finding */
export type FindingSeverity = 'error' | 'warning' | 'info';

/** @purpose Source attribution for a finding — model that produced it */
export type FindingSource = {
  /** @purpose Model identifier (e.g. deepseek, kimi, sonnet) */
  model: string;
  /** @purpose Session run identifier */
  runId: string;
};

/** @purpose Mark applied during multi-model synthesis */
export type FindingMark = 'consensus' | 'dispute' | 'unique';

/** @purpose A single finding entry in findings.jsonl */
export type FindingEntry = {
  /** @purpose Sequential finding identifier (F-1, F-2, ...) */
  id: string;
  /** @purpose File path relative to repo root */
  file: string;
  /** @purpose Line number — 0 when file-level finding */
  line: number;
  /** @purpose One-line summary of the finding */
  summary: string;
  /** @purpose Severity of the finding */
  severity: FindingSeverity;
  /** @purpose Sources — models that produced this finding */
  source: FindingSource[];
  /** @purpose Synthesis mark — assigned post-synthesis */
  mark?: FindingMark;
  /** @purpose Bounded changed-line context for the operator diff-note. */
  diff?: Array<{ type: 'context' | 'add' | 'remove'; num?: number; text: string }>;
  /** @purpose Evidence verification state. */
  factcheck?: 'verified' | 'pending' | 'debunked';
};

/**
 * @purpose Append-only JSONL journal for review findings, one line per finding entry.
 * @invariant O_APPEND + fsync per line; broken tail transparently discarded on read.
 * @invariant F-n ids are sequential; re-read restores max id from existing file.
 */
export class FindingsJournal {
  /** @purpose Absolute path to findings.jsonl */
  protected _filePath: string;
  /** @purpose Highest F-n assigned so far — restored from disk on construction */
  protected _lastId: number;
  /** @purpose Promise chain for serializing writes */
  protected _writeChain: Promise<void>;

  /**
   * @purpose Open a findings journal at the given file path.
   * @param filePath Path to findings.jsonl.
   * @sideEffect Creates parent directories; reads existing file to restore max id.
   */
  constructor(filePath: string) {
    this._filePath = filePath;
    this._writeChain = Promise.resolve();
    this._ensureDir();
    this._lastId = this._scanMaxId();
    logger.debug('[FindingsJournal#constructor] [init → ready]', {
      filePath,
      lastId: this._lastId,
    });
  }

  /**
   * @purpose Append a single finding entry to the journal.
   * @param entry Finding data without id — id is auto-assigned.
   * @throws When the write fails.
   * @returns The assigned id string (F-n).
   * @sideEffect Appends one JSON line with O_APPEND + fsync.
   */
  append(entry: Omit<FindingEntry, 'id'>): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._writeChain = this._writeChain.then(() => {
        try {
          this._lastId += 1;
          const id = `F-${this._lastId}`;
          const full: FindingEntry = { ...entry, id };
          this._writeLine(full);
          logger.debug('[FindingsJournal#append] [writing → written]', { id, file: entry.file });
          resolve(id);
        } catch (cause) {
          this._lastId -= 1;
          const error = new Error('[FindingsJournal#append] Write failed', { cause });
          logger.error('[FindingsJournal#append] [writing → failed]', {
            error,
            filePath: this._filePath,
          });
          reject(error);
        }
      });
    });
  }

  /**
   * @purpose Append multiple finding entries atomically in sequence.
   * @param entries Array of finding data without ids.
   * @returns Array of assigned ids in the same order.
   * @sideEffect Appends one JSON line per entry with O_APPEND + fsync each.
   */
  appendMany(entries: Omit<FindingEntry, 'id'>[]): Promise<string[]> {
    // purpose: each append is sequential via write chain to avoid interleaving
    return Promise.all(entries.map((entry) => this.append(entry)));
  }

  /**
   * @purpose Read all finding entries from the journal file.
   * @returns Parsed entries in append order; empty array when file absent.
   */
  read(): FindingEntry[] {
    return this._readEntries();
  }

  /**
   * @purpose Read entries filtered by model source.
   * @param model Model identifier to filter by.
   * @returns Entries from the specified model.
   */
  readByModel(model: string): FindingEntry[] {
    return this._readEntries().filter((e) => e.source.some((s) => s.model === model));
  }

  /**
   * @purpose Scan the existing journal file to find the highest F-n id.
   * @returns Max id number; 0 if file absent or empty.
   */
  protected _scanMaxId(): number {
    const entries = this._readEntries();
    if (entries.length === 0) return 0;
    const lastEntry = entries[entries.length - 1];
    return parseInt(lastEntry.id.replace('F-', ''), 10) || 0;
  }

  /**
   * @purpose Read all whole entries from the JSONL file, stopping at the first broken line.
   * @returns Parsed entries; empty array when file absent or unreadable.
   */
  protected _readEntries(): FindingEntry[] {
    if (!existsSync(this._filePath)) return [];
    try {
      const raw = readFileSync(this._filePath, 'utf8');
      const entries: FindingEntry[] = [];
      // #region START_PARSE_LINES — corrupt line is skipped with an error log
      for (const [index, line] of raw.split('\n').entries()) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as FindingEntry);
        } catch {
          logger.error('[FindingsJournal#read] [parsing → corrupt_line_skipped]', {
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
   * @purpose Create parent directories for the journal file.
   */
  protected _ensureDir(): void {
    const dir = dirname(this._filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * @purpose Write a single JSON line with O_APPEND + fsync.
   * @param entry Complete finding entry.
   * @sideEffect Appends one JSON line + fsync to the journal file.
   */
  protected _writeLine(entry: FindingEntry): void {
    const line = JSON.stringify(entry) + '\n';
    const fd = openSync(this._filePath, 'a');
    try {
      writeSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
