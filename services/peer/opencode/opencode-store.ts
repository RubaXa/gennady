// @file: OpenCode session store — read sessions and message parts from the local opencode.db.
// @spec: PEER
// @consumers: opencode.transport

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @purpose One OpenCode session as stored in the local database.
 * @consumer opencode-store, opencode.transport
 */
export type OpenCodeSession = {
  /** @purpose Session id (e.g. `ses_…`). */
  id: string;
  /** @purpose Human title (user-editable). */
  title: string;
  /** @purpose Working directory of the session. */
  directory: string;
  /** @purpose Last update time (epoch ms). */
  timeUpdated: number;
  /** @purpose Serialized model reference. */
  model?: string;
};

/**
 * @purpose Path to the OpenCode SQLite database.
 */
export const opencodeDbPath = (): string =>
  process.env.GENNADY_OPENCODE_DB ?? join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

/**
 * @purpose Run a read-only SQLite query returning JSON rows.
 * @param sql Select statement.
 * @returns Parsed rows, or [] when the database is absent or the query fails.
 */
const queryJson = <T>(sql: string): T[] => {
  const db = opencodeDbPath();
  if (!existsSync(db)) return [];
  try {
    const out = execFileSync('sqlite3', ['-readonly', '-json', db, sql], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const trimmed = out.trim();
    return trimmed ? (JSON.parse(trimmed) as T[]) : [];
  } catch {
    return [];
  }
};

/**
 * @purpose Escape a value for a single-quoted SQL literal.
 */
export const sqlLiteral = (value: string): string => value.replace(/'/g, "''");

/**
 * @purpose List recent OpenCode sessions, newest first.
 */
export const listOpenCodeSessions = (): OpenCodeSession[] =>
  queryJson<{ id: string; title: string; directory: string; time_updated: number; model: string }>(
    'SELECT id, title, directory, time_updated, model FROM session WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 200'
  ).map((row) => ({
    id: row.id,
    title: row.title,
    directory: row.directory,
    timeUpdated: row.time_updated,
    model: row.model,
  }));

/**
 * @purpose Read the last assistant text parts of a session.
 */
export const readOpenCodeTexts = (sessionId: string, limit = 6): string[] =>
  queryJson<{ text: string }>(
    `SELECT json_extract(data,'$.text') AS text FROM part WHERE session_id='${sqlLiteral(
      sessionId
    )}' AND json_extract(data,'$.type')='text' ORDER BY time_created DESC LIMIT ${Number(limit)}`
  )
    .map((row) => row.text)
    .filter((text) => typeof text === 'string' && text.trim().length > 0);
