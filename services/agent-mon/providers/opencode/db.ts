// @file: SQLite query functions for OpenCode sessions database
// @consumers: OpenCodeProvider
// @tasks: TSK-40

import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { ScanOpts } from '../../model/scan-opts.type.js';

/** @purpose Raw row shape from the OpenCode session table. */
export type SessionRow = {
  /** @purpose Unique session identifier */
  id: string;
  /** @purpose URL-friendly unique slug for the session */
  slug: string;
  /** @purpose Human-readable session title */
  title: string | null;
  /** @purpose Working directory the session was started in */
  directory: string;
  /** @purpose Session creation timestamp in epoch ms */
  time_created: number;
  /** @purpose Session last update timestamp in epoch ms */
  time_updated: number;
  /** @purpose Agent name used for the session */
  agent: string | null;
  /** @purpose Model name used for the session */
  model: string | null;
  /** @purpose Input token count for the session */
  tokens_input: number | null;
  /** @purpose Output token count for the session */
  tokens_output: number | null;
  /** @purpose Parent session ID for forked sessions */
  parent_id: string | null;
};

/**
 * @purpose Query active (non-archived) sessions from the OpenCode database.
 * @param db Open SQLite database connection.
 * @param [opts] Optional scan filtering parameters.
 * @returns Rows matching the active session criteria, ordered by most recently updated.
 */
export function querySessions(db: DatabaseSync, opts?: ScanOpts): SessionRow[] {
  let sql = `SELECT id, slug, title, directory, time_created, time_updated, agent, model, tokens_input, tokens_output, parent_id FROM session WHERE time_archived IS NULL`;
  const params: SQLInputValue[] = [];

  // Default: last 24 hours by time_updated (activity), unless explicit since is provided
  const since = opts?.since ?? Date.now() - 24 * 60 * 60 * 1000;
  sql += ' AND time_updated >= ?';
  params.push(since);

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
  if (!row?.data) return null;

  try {
    const msg = JSON.parse(row.data);
    const content = msg?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0]?.text === 'string') {
      return content[0].text;
    }
    return null;
  } catch {
    return row.data;
  }
}
