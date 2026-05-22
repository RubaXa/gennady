// @file: Unit tests for OpenCodeProvider — session scanning with DI
// @consumers: monitor, CLI
// @tasks: TSK-40

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { OpenCodeProvider } from '../opencode-provider.ts';
import type { SessionRow } from '../db.ts';

/**
 * @purpose Build a minimal valid SessionRow for mock injection.
 */
function makeSessionRow(overrides?: Partial<SessionRow>): SessionRow {
  return {
    id: 'sess-1',
    slug: 'witty-star',
    title: 'test session',
    directory: '/home/test',
    time_created: 1000,
    time_updated: 2000,
    agent: null,
    model: '{"id":"deepseek-v4-pro"}',
    tokens_input: 100,
    tokens_output: 200,
    parent_id: null,
    ...overrides,
  };
}

describe('OpenCodeProvider', () => {
  describe('#key', () => {
    it('exposes key as "opencode"', () => {
      const provider = new OpenCodeProvider();
      assert.strictEqual(provider.key, 'opencode');
    });
  });

  describe('#scan', () => {
    it('returns empty on missing db', async () => {
      // purpose: verify graceful degradation — non-existent DB path yields empty array, never throws
      // contract: AgentProvider.scan() must return [] on source unavailability per @see AgentProvider contract
      // failure mode: do not assert on internal _logger calls — only the return value contract

      // #region START_MISSING_DB_SETUP
      const provider = new OpenCodeProvider({
        dbPath: '/nonexistent/path/to/opencode.db',
      });
      // #endregion END_MISSING_DB_SETUP

      // #region START_MISSING_DB_TRIGGER
      const sessions = await provider.scan();
      // #endregion END_MISSING_DB_TRIGGER

      // #region START_MISSING_DB_ASSERT
      assert.deepStrictEqual(sessions, []);
      // #endregion END_MISSING_DB_ASSERT
    });

    it('returns sessions from db', async () => {
      // purpose: verify scan pipeline maps SessionRow → AgentSession with correct provider, status, and field mapping
      // contract: scan returns AgentSession[] with provider='opencode', status='active', and all mapped fields
      // failure mode: do not assert on db internals — verify through public scan output shape

      // #region START_SCAN_SESSIONS_SETUP_DI
      const testRow = makeSessionRow();
      const lastMessage = 'hello world';

      // mock query functions return fixed data without touching the real DB
      const mockQuerySessions = mock.fn((_db: DatabaseSync, _opts?: unknown): SessionRow[] => [testRow]);
      const mockQueryLastMessage = mock.fn((_db: DatabaseSync, _sessionId: string): string | null => lastMessage);

      const provider = new OpenCodeProvider({
        dbPath: ':memory:',   // scan() opens a real empty in-memory DB; query mocks bypass it
        querySessions: mockQuerySessions,
        queryLastMessage: mockQueryLastMessage,
        parseModelJson: (_raw) => 'deepseek-v4-pro',
      });
      // #endregion END_SCAN_SESSIONS_SETUP_DI

      // #region START_SCAN_SESSIONS_TRIGGER
      const sessions = await provider.scan();
      // #endregion END_SCAN_SESSIONS_TRIGGER

      // #region START_SCAN_SESSIONS_OBSERVE
      // observation focus: verify mapped AgentSession shape matches contract
      const actual = sessions[0];
      // #endregion END_SCAN_SESSIONS_OBSERVE

      // #region START_SCAN_SESSIONS_ASSERT
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(actual.provider, 'opencode');
      assert.strictEqual(actual.sessionId, 'witty-star');
      assert.strictEqual(actual.slug, 'witty-star');
      assert.strictEqual(actual.title, 'test session');
      assert.strictEqual(actual.cwd, '/home/test');
      assert.strictEqual(actual.model, 'deepseek-v4-pro');
      assert.strictEqual(actual.status, 'active');
      assert.strictEqual(actual.startedAt, 1000);
      assert.strictEqual(actual.lastActivityAt, 2000);
      assert.strictEqual(actual.elapsedSeconds, 1);   // Math.round((2000-1000)/1000) = 1
      assert.strictEqual(actual.lastMessage, 'hello world');
      assert.strictEqual(actual.tokensInput, 100);
      assert.strictEqual(actual.tokensOutput, 200);
      assert.strictEqual(actual.pid, null);
      assert.strictEqual(actual.parentId, undefined);
      // #endregion END_SCAN_SESSIONS_ASSERT
    });

    it('propagates parentId', async () => {
      // purpose: verify parent_id non-null in DB row → AgentSession.parentId string
      // contract: null parent_id → undefined; non-null parent_id → string value propagated

      // #region START_PARENT_ID_SETUP
      const testRow = makeSessionRow({
        id: 'sess-2',
        slug: 'child-star',
        title: 'child session',
        directory: '/home/child',
        parent_id: 'ses_parent',
        model: null,
        tokens_input: null,
        tokens_output: null,
      });

      const mockQuerySessions = mock.fn((_db: DatabaseSync, _opts?: unknown): SessionRow[] => [testRow]);
      const mockQueryLastMessage = mock.fn((_db: DatabaseSync, _sessionId: string): null => null);

      const provider = new OpenCodeProvider({
        dbPath: ':memory:',
        querySessions: mockQuerySessions,
        queryLastMessage: mockQueryLastMessage,
        parseModelJson: (_raw) => undefined,
      });
      // #endregion END_PARENT_ID_SETUP

      // #region START_PARENT_ID_TRIGGER
      const sessions = await provider.scan();
      // #endregion END_PARENT_ID_TRIGGER

      // #region START_PARENT_ID_ASSERT
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].sessionId, 'child-star');
      assert.strictEqual(sessions[0].parentId, 'ses_parent');
      // #endregion END_PARENT_ID_ASSERT
    });
  });
});
