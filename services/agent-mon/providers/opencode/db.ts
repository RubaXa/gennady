// @file: SQLite query functions for OpenCode sessions database
// @consumers: OpenCodeProvider
// @tasks: TSK-40

import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { ScanOpts } from '../../model/scan-opts.type.js';

/** @purpose Raw row shape from the OpenCode session table. */
export type SessionRow = {
  id: string;
  slug: string;
  title: string | null;
  directory: string;
  time_created: number;
  time_updated: number;
  agent: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  parent_id: string | null;
};

/**
 * @purpose Query active (non-archived) sessions from the OpenCode database.
 * @param db Open SQLite database connection.
 * @param opts Optional scan filtering parameters.
 * @returns Rows matching the active session criteria, ordered by most recently updated.
 */
export function querySessions(db: DatabaseSync, opts?: ScanOpts): SessionRow[] {
  let sql = `SELECT id, slug, title, directory, time_created, time_updated, agent, model, tokens_input, tokens_output, parent_id FROM session WHERE time_archived IS NULL`;
  const params: SQLInputValue[] = [];

  // #region START_APPLY_SINCE_FILTER
  if (opts?.since !== undefined) {
    sql += ' AND time_created >= ?';
    if (opts.since === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      params.push(today.getTime());
    } else {
      params.push(opts.since);
    }
  }
  // #endregion END_APPLY_SINCE_FILTER

  sql += ' ORDER BY time_updated DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as SessionRow[];
}

/**
 * @purpose Retrieve the last message data for a session.
 * @param db Open SQLite database connection.
 * @param sessionId The session identifier to look up.
 * @returns The raw message data string, or null if no messages found.
 */
export function queryLastMessage(db: DatabaseSync, sessionId: string): string | null {
  const stmt = db.prepare(
    'SELECT data FROM message WHERE session_id = ? ORDER BY time_updated DESC LIMIT 1'
  );
  const row = stmt.get(sessionId) as { data: string } | undefined;
  return row?.data ?? null;
}
