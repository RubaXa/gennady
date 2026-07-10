// @file: AuditLog — append-only JSON Lines event log with rotation at 10MB for serve-mode.
// @consumers: StateStore, inbox-api
// @tasks: TSK-109

import { appendFile, rename, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '#logger';

/** @purpose Single audit event entry written to audit.jsonl. */
export type AuditEntry = {
  /** @purpose ISO timestamp of the event */
  ts: string;
  /** @purpose MR web URL this event relates to */
  mr: string;
  /** @purpose Role active at the time of the event */
  role: string;
  /** @purpose Event name (e.g. 'classified', 'posted', 'approved', 'escalated') */
  event: string;
  /** @purpose Free-form detail (e.g. stage transition, permission change) */
  detail?: string;
};

/** @purpose Max file size in bytes before rotation triggers — 10 MB. */
const ROTATION_THRESHOLD = 10 * 1024 * 1024;

/**
 * @purpose Append-only JSON Lines audit log for serve-mode events.
 * @invariant Append-only: existing entries are never modified or deleted.
 * @invariant Rotation: when audit.jsonl exceeds 10 MB, it is renamed to audit.<N>.jsonl.
 * @invariant Rotation strategy: find lowest unused N starting from 1.
 */
export class AuditLog {
  /** @purpose Root state directory path. */
  protected _stateDir: string;
  /** @purpose Base path for audit log files. */
  protected _basePath: string;
  /** @purpose Lock to serialize append operations. */
  protected _lock: Promise<void> = Promise.resolve();

  /**
   * @purpose Create an AuditLog instance bound to a state directory.
   * @param [stateDir] Root state directory (defaults to ~/.gennady).
   */
  constructor(stateDir?: string) {
    this._stateDir = stateDir ?? join(homedir(), '.gennady');
    this._basePath = join(this._stateDir, 'agent-inbox', 'audit');
  }

  /**
   * @purpose Path to the current active audit log file.
   * @returns Full path to audit.jsonl.
   */
  get logPath(): string {
    return `${this._basePath}.jsonl`;
  }

  /**
   * @purpose Append a single event as a JSON line to the audit log.
   * @invariant Rotation is checked before each append; if the file exceeds 10 MB, it is rotated first.
   * @param entry Event to append (ts, mr, role, event, detail).
   * @returns Promise that resolves when the entry is written.
   * @sideEffect Writes one JSON line to the audit log file; may trigger rotation.
   */
  async append(entry: AuditEntry): Promise<void> {
    const prev = this._lock;
    let release: () => void;
    this._lock = new Promise<void>((r) => {
      release = r;
    });

    await prev;

    try {
      logger.debug('[AuditLog#append] [idle → appending]', { mr: entry.mr, event: entry.event });

      // #region START_ROTATE_IF_NEEDED
      try {
        await this.rotateIfNeeded();
      } catch (cause) {
        logger.warn(
          '[AuditLog#append] [appending → rotation_warn] Rotation check failed, continuing',
          { cause }
        );
      }
      // #endregion END_ROTATE_IF_NEEDED

      // #region START_APPEND_JSON_LINE
      const line = JSON.stringify(entry) + '\n';
      try {
        await appendFile(this.logPath, line, 'utf-8');
        logger.debug('[AuditLog#append] [appending → appended]', {
          mr: entry.mr,
          event: entry.event,
        });
      } catch (cause) {
        const error = new Error('[AuditLog#append] Failed to append audit event', { cause });
        logger.error('[AuditLog#append] [appending → failed]', { error, entry });
        throw error;
      }
      // #endregion END_APPEND_JSON_LINE
    } finally {
      release!();
    }
  }

  /**
   * @purpose Query all audit events for a specific MR.
   * @param mr MR web URL to filter by.
   * @returns Array of audit entries for the given MR, oldest first.
   * @sideEffect Reads the current audit log file and all rotated files.
   */
  async query(mr: string): Promise<AuditEntry[]> {
    logger.debug('[AuditLog#query] [idle → querying]', { mr });

    // #region START_READ_ALL_LOG_FILES
    const results: AuditEntry[] = [];
    const filesToRead: string[] = [];

    // invariant: read rotated logs first (oldest), then current; sort by ts for chronological order
    let n = 1;
    while (existsSync(`${this._basePath}.${n}.jsonl`)) {
      filesToRead.push(`${this._basePath}.${n}.jsonl`);
      n++;
    }
    // current file last (newest)
    filesToRead.push(this.logPath);

    for (const filePath of filesToRead) {
      try {
        const content = await readFile(filePath, 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry: AuditEntry = JSON.parse(line);
            if (entry.mr === mr) {
              results.push(entry);
            }
          } catch {
            // skip malformed lines
          }
        }
      } catch (cause) {
        logger.warn('[AuditLog#query] [querying → read_error] Skipping unreadable file', {
          filePath,
          cause,
        });
      }
    }
    // #endregion END_READ_ALL_LOG_FILES

    // invariant: sort by ts ascending to return chronological order (oldest first)
    results.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    logger.debug('[AuditLog#query] [querying → queried]', { mr, matchCount: results.length });
    return results;
  }

  /**
   * @purpose Rotate the audit log: rename audit.jsonl to audit.<N>.jsonl where N is the lowest unused number.
   * @returns Promise that resolves when rotation is complete.
   * @sideEffect File rename on disk.
   */
  async rotate(): Promise<void> {
    logger.debug('[AuditLog#rotate] [idle → rotating]');

    // #region START_FIND_ROTATION_SLOT
    // invariant: find lowest N such that audit.<N>.jsonl does not exist
    let n = 1;
    while (existsSync(`${this._basePath}.${n}.jsonl`)) {
      n++;
    }
    const targetPath = `${this._basePath}.${n}.jsonl`;
    // #endregion END_FIND_ROTATION_SLOT

    // #region START_EXECUTE_ROTATION
    if (!existsSync(this.logPath)) {
      logger.debug('[AuditLog#rotate] [rotating → skipped] No log file to rotate');
      return;
    }
    try {
      await rename(this.logPath, targetPath);
      logger.info('[AuditLog#rotate] [rotating → rotated]', { from: this.logPath, to: targetPath });
    } catch (cause) {
      const error = new Error('[AuditLog#rotate] Rotation rename failed', { cause });
      logger.error('[AuditLog#rotate] [rotating → failed]', { error });
      throw error;
    }
    // #endregion END_EXECUTE_ROTATION
  }

  /**
   * @purpose Check if the current log file exceeds the rotation threshold and rotate if so.
   * @returns Promise that resolves when the check completes.
   * @sideEffect May trigger file rename.
   */
  async rotateIfNeeded(): Promise<void> {
    if (!existsSync(this.logPath)) return;

    try {
      const stats = await stat(this.logPath);
      if (stats.size >= ROTATION_THRESHOLD) {
        logger.debug('[AuditLog#rotateIfNeeded] [checking → rotating] Threshold exceeded', {
          size: stats.size,
          threshold: ROTATION_THRESHOLD,
        });
        await this.rotate();
      }
    } catch (cause) {
      // invariant: stat failure (e.g. file deleted between check and stat) → skip rotation
      logger.warn('[AuditLog#rotateIfNeeded] [checking → stat_failed]', { cause });
    }
  }
}
