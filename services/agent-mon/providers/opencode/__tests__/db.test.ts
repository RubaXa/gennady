// @file: Unit tests for querySessions — SQLite session filtering
// @consumers: OpenCodeProvider
// @tasks: TSK-40

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { querySessions, queryLastMessage } from '../db.ts';
import type { SessionRow } from '../db.ts';

/**
 * @purpose Create the OpenCode session table in the given database.
 * Schema matches the real OpenCode session table structure consumed by querySessions.
 */
function createSessionTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT,
      directory TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_archived INTEGER,
      agent TEXT,
      model TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      parent_id TEXT
    )
  `);
}

/**
 * @purpose Insert a session row and return the inserted row for assertion reference.
 */
function insertSession(db: DatabaseSync, overrides: Partial<SessionRow> & { id: string; slug: string; directory: string }): SessionRow {
  const defaults: SessionRow = {
    title: null,
    time_created: 1000,
    time_updated: 2000,
    agent: null,
    model: null,
    tokens_input: null,
    tokens_output: null,
    parent_id: null,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO session (id, slug, title, directory, time_created, time_updated, time_archived, agent, model, tokens_input, tokens_output, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    defaults.id,
    defaults.slug,
    defaults.title,
    defaults.directory,
    defaults.time_created,
    defaults.time_updated,
    null, // time_archived — insert NULL for active sessions, value for archived
    defaults.agent,
    defaults.model,
    defaults.tokens_input,
    defaults.tokens_output,
    defaults.parent_id
  );
  return defaults;
}

/**
 * @purpose Insert an archived session (time_archived set) for filter exclusion tests.
 */
function insertArchivedSession(db: DatabaseSync, overrides: Partial<SessionRow> & { id: string; slug: string; directory: string }): SessionRow {
  const row = { ...overrides, id: overrides.id, slug: overrides.slug, directory: overrides.directory };
  const defaults = insertSession(db, row);
  db.prepare('UPDATE session SET time_archived = 1 WHERE id = ?').run(defaults.id);
  return defaults;
}

describe('querySessions', () => {
  let db: DatabaseSync;

  before(() => {
    db = new DatabaseSync(':memory:');
    createSessionTable(db);
  });

  after(() => {
    db.close();
  });

  it('returns only non-archived sessions', () => {
    // purpose: verify archive filter contract — only rows with time_archived IS NULL are returned
    // contract: archived sessions are excluded; active sessions ordered by time_updated DESC
    // failure mode: do not assert on db.prepare internals — verify through public return value

    // #region START_FILTER_ARCHIVED_SETUP
    const active = insertSession(db, {
      id: 'sess-1',
      slug: 'active-session',
      directory: '/home/test',
      title: 'Active',
      time_created: 1000,
      time_updated: 2000,
    });
    insertArchivedSession(db, {
      id: 'sess-2',
      slug: 'archived-session',
      directory: '/home/test',
      title: 'Archived',
      time_created: 500,
      time_updated: 1500,
    });
    // #endregion END_FILTER_ARCHIVED_SETUP

    // #region START_FILTER_ARCHIVED_TRIGGER
    const rows = querySessions(db);
    // #endregion END_FILTER_ARCHIVED_TRIGGER

    // #region START_FILTER_ARCHIVED_ASSERT
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, active.id);
    assert.strictEqual(rows[0].slug, active.slug);
    // #endregion END_FILTER_ARCHIVED_ASSERT
  });

  it('returns all active sessions ordered by time_updated DESC', () => {
    // purpose: verify ordering contract — most recently updated sessions appear first
    // contract: ORDER BY time_updated DESC is deterministic

    // #region START_ORDERING_SETUP
    const older = insertSession(db, {
      id: 'sess-older',
      slug: 'older-session',
      directory: '/home/test',
      time_created: 1000,
      time_updated: 1500,
    });
    const newer = insertSession(db, {
      id: 'sess-newer',
      slug: 'newer-session',
      directory: '/home/test',
      time_created: 2000,
      time_updated: 3000,
    });
    // #endregion END_ORDERING_SETUP

    // #region START_ORDERING_TRIGGER
    const rows = querySessions(db);
    // #endregion END_ORDERING_TRIGGER

    // #region START_ORDERING_ASSERT
    // newer should come first due to DESC ordering
    const activeIds = rows.map(r => r.id);
    const newIdx = activeIds.indexOf('sess-newer');
    const oldIdx = activeIds.indexOf('sess-older');
    assert.ok(newIdx >= 0, 'newer session must be present');
    assert.ok(oldIdx >= 0, 'older session must be present');
    assert.ok(newIdx < oldIdx, 'newer session must appear before older');
    // #endregion END_ORDERING_ASSERT
  });

  it('filters by since timestamp', () => {
    // purpose: verify time-based filtering — only sessions created on or after `since` are returned
    // contract: since=2500 excludes sessions with time_created < 2500

    // #region START_SINCE_SETUP
    insertSession(db, {
      id: 'sess-early',
      slug: 'early-session',
      directory: '/home/test',
      time_created: 1000,
      time_updated: 1100,
    });
    const late = insertSession(db, {
      id: 'sess-late',
      slug: 'late-session',
      directory: '/home/test',
      time_created: 3000,
      time_updated: 3100,
    });
    // #endregion END_SINCE_SETUP

    // #region START_SINCE_TRIGGER
    const rows = querySessions(db, { since: 2500 });
    // #endregion END_SINCE_TRIGGER

    // #region START_SINCE_ASSERT
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, late.id);
    // #endregion END_SINCE_ASSERT
  });

  it('filters by since "today" keyword', () => {
    // purpose: verify 'today' keyword resolves to start of current day
    // contract: sessions created before today 00:00 are excluded

    // #region START_SINCE_TODAY_SETUP
    insertSession(db, {
      id: 'sess-ancient',
      slug: 'ancient',
      directory: '/home/test',
      time_created: 1000,
      time_updated: 1100,
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const recent = insertSession(db, {
      id: 'sess-today',
      slug: 'today',
      directory: '/home/test',
      time_created: todayStart.getTime() + 1000,
      time_updated: todayStart.getTime() + 2000,
    });
    // #endregion END_SINCE_TODAY_SETUP

    // #region START_SINCE_TODAY_TRIGGER
    const rows = querySessions(db, { since: 'today' });
    // #endregion END_SINCE_TODAY_TRIGGER

    // #region START_SINCE_TODAY_ASSERT
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, recent.id);
    // #endregion END_SINCE_TODAY_ASSERT
  });
});

describe('queryLastMessage', () => {
  let db: DatabaseSync;

  before(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS message (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        data TEXT,
        time_updated INTEGER NOT NULL
      )
    `);
  });

  after(() => {
    db.close();
  });

  it('returns the most recent message data for a session', () => {
    // #region START_LAST_MSG_SETUP
    db.prepare('INSERT INTO message (session_id, data, time_updated) VALUES (?, ?, ?)').run('sess-1', 'first message', 1000);
    db.prepare('INSERT INTO message (session_id, data, time_updated) VALUES (?, ?, ?)').run('sess-1', 'second message', 2000);
    db.prepare('INSERT INTO message (session_id, data, time_updated) VALUES (?, ?, ?)').run('sess-2', 'other session', 1500);
    // #endregion END_LAST_MSG_SETUP

    // #region START_LAST_MSG_TRIGGER
    const result = queryLastMessage(db, 'sess-1');
    // #endregion END_LAST_MSG_TRIGGER

    // #region START_LAST_MSG_ASSERT
    assert.strictEqual(result, 'second message');
    // #endregion END_LAST_MSG_ASSERT
  });

  it('returns null when no messages exist for session', () => {
    const result = queryLastMessage(db, 'nonexistent');
    assert.strictEqual(result, null);
  });
});
