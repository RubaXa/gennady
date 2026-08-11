// @file: Unit/integration tests for inbox-chat ChatSession — contract typing, single-flight
//   serialization per sid (D-104), stop()-truncated replay (D-95/CH-11), tool-registry shape
//   (D-103), and transcript rehydrate across a simulated restart (D-97/SV-13).
// @consumers: node:test runner
// @tasks: TSK-126, TSK-167, TSK-175

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chat-session.ts';
import { ContextAssembler } from '../context-assembler.ts';
import { ChatTranscript } from '../chat-transcript.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { SessionPool } from '../../inbox-opencode/session-pool.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { ChatTurn, ContextChip, MutationProposal } from '../types.ts';
import { makeTestTmpDir } from '../../inbox-core/test-support/test-tmp.ts';

// A chat turn no longer forces a json_schema (the answer is free prose), so OpenCodeMock keys the
// seeded response off the prompt text's FIRST WORD (its no-format fallback in _extractNodeId), not a
// schema title. Each test seeds by that first word and returns `{ text }` prose.

// ── unified context ──

type SessionContext = {
  stateDir: string;
  store: StateStore;
  pool: SessionPool;
  openCodeMock: OpenCodeMock;
  assembler: ContextAssembler;
  mrRef: string;
  session: ChatSession;
};

function createSessionContext(overrides: Partial<{ mrRef: string }> = {}): SessionContext {
  const stateDir = makeTestTmpDir('chat-session-');
  const store = new StateStore(stateDir);
  const openCodeMock = new OpenCodeMock();
  const pool = new SessionPool({ maxSessions: 5, opencode: openCodeMock });
  const assembler = new ContextAssembler({ store });
  const mrRef = overrides.mrRef ?? 'group/proj!42';
  const session = new ChatSession({ pool, store, assembler, mrRef });
  return { stateDir, store, pool, openCodeMock, assembler, mrRef, session };
}

// ── tests ──

describe('ChatSession/ContextAssembler/ChatTranscript — type contract', () => {
  it('Типизация ChatSession/ContextAssembler/Transcript', () => {
    const chip: ContextChip = {
      kind: 'selection',
      quote: 'sample',
      source: 'file.ts:10',
      origin: { artifact: 'file.ts', startLine: 10, endLine: 10 },
    };
    // @ts-expect-error - ContextChipKind is a closed enum; arbitrary strings must not compile
    const invalidChip: ContextChip = {
      kind: 'bogus',
      quote: 'x',
      source: 'y',
      origin: { artifact: 'y', startLine: 1, endLine: 1 },
    };
    const mutation: MutationProposal = { op: 'edit', target: 'C-1', before: 'a', after: 'b' };
    const turn: ChatTurn = {
      id: '1',
      ts: new Date().toISOString(),
      question: 'q',
      chips: [chip],
      answer: 'a',
      reviewRevision: 0,
      mutations: [mutation],
    };

    assert.strictEqual(chip.kind, 'selection');
    assert.strictEqual(turn.mutations?.[0]?.op, 'edit');
    assert.strictEqual(invalidChip.kind, 'bogus');
  });
});

describe('ChatSession#ask', () => {
  it('Один ход за раз на sid', async () => {
    const { session, openCodeMock } = createSessionContext();
    openCodeMock.seed('question', { text: 'first turn answer' });

    const [first, second] = await Promise.all([
      session.ask({ text: 'question one', chips: [] }),
      session.ask({ text: 'question two', chips: [] }),
    ]);

    assert.strictEqual(first.ok, true);
    assert.strictEqual(second.ok, false);
    if (!second.ok) {
      assert.strictEqual(second.error, 'TURN_IN_FLIGHT');
    }
  });

  it('Stop сохраняет частичный текст', async () => {
    const { session, openCodeMock } = createSessionContext();
    openCodeMock.seed('stop', { text: 'one two three four five' });
    const firstTokenReceived = new Promise<void>((resolve) => {
      session.onToken(() => resolve());
    });

    const askPromise = session.ask({ text: 'stop me', chips: [] });
    await firstTokenReceived;
    const stopStart = performance.now();
    await session.stop();
    const stopElapsedMs = performance.now() - stopStart;
    const result = await askPromise;

    assert.ok(stopElapsedMs < 200);
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.turn.answer, 'one ');
      assert.strictEqual(result.turn.stopped, true);
    }
  });

  it('Tool-registry без vcs-* write', async () => {
    const { session, pool, openCodeMock } = createSessionContext();
    openCodeMock.seed('hi', { text: 'ok' });
    const createSpy = mock.method(pool, 'create');
    const runSpy = mock.method(pool, 'run');

    await session.ask({ text: 'hi', chips: [] });

    const createArgs = createSpy.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    const runtimeRequest = runSpy.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    const promptArgs = runtimeRequest['prompt'] as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(createArgs).sort(), ['directory', 'registration', 'title']);
    assert.deepStrictEqual(Object.keys(promptArgs).sort(), ['system', 'text']);
    assert.strictEqual(runtimeRequest['taskId'], 'chat:group/proj!42');
    assert.strictEqual(runtimeRequest['model'], 'default');
  });
});

describe('ChatSession#rehydrate', () => {
  it('Rehydrate восстанавливает транскрипт', async () => {
    const ctx = createSessionContext();
    const priorTurn: ChatTurn = {
      id: 'turn-1',
      ts: '2026-07-15T00:00:00.000Z',
      question: 'earlier question',
      chips: [
        {
          kind: 'mention',
          quote: 'foo.ts',
          source: 'file:foo.ts',
          origin: { artifact: 'foo.ts', startLine: 1, endLine: 1 },
        },
      ],
      answer: 'earlier answer',
      reviewRevision: 0,
    };
    await new ChatTranscript(ctx.stateDir).append(ctx.mrRef, priorTurn);
    const restartedSession = new ChatSession({
      pool: ctx.pool,
      store: ctx.store,
      assembler: ctx.assembler,
      mrRef: ctx.mrRef,
    });

    await restartedSession.rehydrate();

    assert.deepStrictEqual(restartedSession.transcript, {
      turns: [priorTurn],
      activeChips: priorTurn.chips,
    });
  });
});
