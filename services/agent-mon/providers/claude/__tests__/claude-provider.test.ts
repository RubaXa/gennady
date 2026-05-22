// @file: Unit tests for ClaudeProvider — scan with DI-mocked dependencies
// @consumers: ClaudeProvider, monitor
// @tasks: TSK-39

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeProvider } from '../claude-provider.ts';
import type { AgentSession } from '../../../model/agent-session.type.ts';
import type { ScanOpts } from '../../../model/scan-opts.type.ts';
import type { SessionJsonData } from '../session-json.ts';
import type { PsInfoEntry } from '../ps.ts';

/**
 * Test Graph
 *
 * ClaudeProvider#scan — tested through DI constructor; filesystem calls (homedir, readdirSync, statSync)
 *   run real because mock.method on built-in module namespace is unsupported in Node.js 22 ESM.
 *   This is a known limitation — readdirSync lists real ~/.claude/sessions/ files.
 *   Tests isolate through DI-mocked deps: readSessionJson, psInfo, parseClaudeArgs, readSessionTitle.
 *
 *   ├── returns empty: mock readSessionJson → null → scan returns []
 *   ├── returns sessions from valid data: mock all DI deps → populated AgentSession array
 *   └── marks session idle when inactive beyond threshold: mock Date.now + low idleThresholdMs
 */

afterEach(() => {
  mock.restoreAll();
});

/**
 * @purpose Create a minimal valid SessionJsonData fixture.
 */
function makeSessionJson(overrides?: Partial<SessionJsonData>): SessionJsonData {
  return {
    pid: 4506,
    sessionId: 'abc',
    cwd: '/project',
    startedAt: 1000,
    ...overrides,
  };
}

/**
 * @purpose Create a PsInfoEntry fixture matching a given pid.
 */
function makePsEntry(overrides?: Partial<PsInfoEntry>): PsInfoEntry {
  return {
    pid: 4506,
    cpuPercent: 2.0,
    memoryMb: 200,
    args: '/usr/bin/claude --model claude-sonnet-4-20250514',
    ...overrides,
  };
}

describe('ClaudeProvider', () => {
  describe('#scan', () => {
    it('returns empty on missing directory', async () => {
      // purpose: verify graceful degradation — when no valid sessions are found, scan returns []
      // contract: readSessionJson returning null for all paths → no sessions built → empty array
      // note: readdirSync runs real; scene relies on readSessionJson mock returning null to produce []

      // #region START_EMPTY_DIR_SETUP
      const provider = new ClaudeProvider({
        readSessionJson: mock.fn((): SessionJsonData | null => null),
        psInfo: mock.fn(() => new Map()),
        readSessionTitle: mock.fn(() => 'Unknown'),
      });
      // #endregion END_EMPTY_DIR_SETUP

      // #region START_EMPTY_DIR_TRIGGER
      const sessions = await provider.scan();
      // #endregion END_EMPTY_DIR_TRIGGER

      // #region START_EMPTY_DIR_ASSERT
      assert.deepStrictEqual(sessions, []);
      // #endregion END_EMPTY_DIR_ASSERT
    });

    it('returns sessions from valid data', async () => {
      // purpose: verify happy-path contract — valid DI deps produce correctly populated AgentSession array
      // contract: provider key is 'claude'; model from parseClaudeArgs; title from readSessionTitle
      // invariant: psInfo called once per scan (batch); sessions carry computed elapsedSeconds and status
      // note: readdirSync runs real listing real ~/.claude/sessions/ files; session count depends on real files

      const sessionJson = makeSessionJson({ pid: 100, sessionId: 'sess-1' });
      const psEntry = makePsEntry({
        pid: 100,
        cpuPercent: 1.5,
        memoryMb: 150,
        args: 'claude --model sonnet',
      });

      // #region START_VALID_DATA_SETUP
      const readSessionJsonMock = mock.fn(
        (_filePath: string): SessionJsonData | null => sessionJson
      );

      const psInfoMock = mock.fn((_pids: number[]): Map<number, PsInfoEntry> => {
        return new Map([[100, psEntry]]);
      });

      const parseClaudeArgsMock = mock.fn((_args: string): { model?: string } => {
        return { model: 'sonnet' };
      });

      const readSessionTitleMock = mock.fn(
        (_cwd: string, _sessionId: string): string => 'Test Session'
      );

      const provider = new ClaudeProvider({
        psInfo: psInfoMock,
        parseClaudeArgs: parseClaudeArgsMock,
        readSessionJson: readSessionJsonMock,
        readSessionTitle: readSessionTitleMock,
      });
      // #endregion END_VALID_DATA_SETUP

      // #region START_VALID_DATA_TRIGGER
      // Use infinite idleThresholdMs to prevent real statSync mtimeMs from triggering idle status
      const sessions = await provider.scan({
        idleThresholdMs: Number.MAX_SAFE_INTEGER,
      } as ScanOpts);
      // #endregion END_VALID_DATA_TRIGGER

      // #region START_VALID_DATA_OBSERVE
      // observation focus: every session must carry provider='claude', status='active', model='sonnet'
      const actual = sessions.map((s) => ({
        provider: s.provider,
        status: s.status,
        model: s.model,
        title: s.title,
        cpuPercent: s.cpuPercent,
        memoryMb: s.memoryMb,
        sessionId: s.sessionId,
      }));
      // #endregion END_VALID_DATA_OBSERVE

      // #region START_VALID_DATA_ASSERT
      assert.ok(sessions.length > 0, 'expected at least 1 session from real filesystem + mock DI');

      // Verify batch ps was called once
      assert.strictEqual(psInfoMock.mock.callCount(), 1, 'expected single batch ps call');

      for (const s of actual) {
        assert.strictEqual(s.provider, 'claude', `expected provider='claude' for ${s.sessionId}`);
        assert.strictEqual(s.status, 'active', `expected status='active' for ${s.sessionId}`);
        assert.strictEqual(s.model, 'sonnet', `expected model='sonnet' for ${s.sessionId}`);
        assert.strictEqual(s.title, 'Test Session', `expected title for ${s.sessionId}`);
        assert.strictEqual(s.cpuPercent, 1.5);
        assert.strictEqual(s.memoryMb, 150);
      }
      // #endregion END_VALID_DATA_ASSERT
    });

    it('marks session idle when inactive beyond threshold', async () => {
      // purpose: verify idle detection contract — low idleThresholdMs forces all alive sessions to 'idle'
      // contract: idleSeconds is computed as (Date.now() - lastActivityAt) / 1000; status='idle' when inactive > threshold
      // invariant: idle threshold is opt-in through ScanOpts; setting threshold to 1ms makes all sessions idle
      // note: statSync runs real providing real mtimeMs; Date.now is mocked to be far in the future to exaggerate idle gap

      const sessionJson = makeSessionJson({ pid: 200, sessionId: 'idle-sess' });
      const psEntry = makePsEntry({
        pid: 200,
        cpuPercent: 0.5,
        memoryMb: 100,
        args: 'claude --model opus',
      });

      // #region START_IDLE_SETUP
      const farFuture = Date.now() + 86_400_000; // 1 day in the future

      const readSessionJsonMock = mock.fn(
        (_filePath: string): SessionJsonData | null => sessionJson
      );

      const psInfoMock = mock.fn((_pids: number[]): Map<number, PsInfoEntry> => {
        return new Map([[200, psEntry]]);
      });

      const parseClaudeArgsMock = mock.fn((_args: string): { model?: string } => {
        return { model: 'opus' };
      });

      const readSessionTitleMock = mock.fn(
        (_cwd: string, _sessionId: string): string => 'Idle Session'
      );

      const provider = new ClaudeProvider({
        psInfo: psInfoMock,
        parseClaudeArgs: parseClaudeArgsMock,
        readSessionJson: readSessionJsonMock,
        readSessionTitle: readSessionTitleMock,
      });

      // Mock Date.now to far future → idle gap > threshold
      mock.method(globalThis.Date, 'now', () => farFuture);
      // #endregion END_IDLE_SETUP

      // #region START_IDLE_TRIGGER
      // idleThresholdMs = 1ms → any gap qualifies as idle
      const sessions = await provider.scan({ idleThresholdMs: 1 } as ScanOpts);
      // #endregion END_IDLE_TRIGGER

      // #region START_IDLE_ASSERT
      assert.ok(sessions.length > 0, 'expected at least 1 session');

      for (const session of sessions) {
        assert.strictEqual(session.provider, 'claude');
        assert.strictEqual(session.status, 'idle', `expected idle status for ${session.sessionId}`);
        assert.ok(
          session.idleSeconds !== undefined,
          `expected idleSeconds for ${session.sessionId}`
        );
        assert.ok(session.idleSeconds! > 0, `expected idleSeconds > 0, got ${session.idleSeconds}`);
      }
      // #endregion END_IDLE_ASSERT
    });
  });
});
