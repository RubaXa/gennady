// @file: Integration test for ChatApiClient — real fetch + real EventSource (undici, since the
//   test process has no global EventSource without --experimental-eventsource) against a real,
//   booted inbox-api HttpServer with the chat bridge wired to a real SessionPool[OpenCodeMock] +
//   real StateStore over a real makeTestTmpDir tree, and a real on-disk review.json for /mutate CAS.
// @consumers: node:test runner
// @tasks: TSK-130

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { HttpServer } from '../../inbox-api/http-server.ts';
import { BoardProviderMock } from '../../inbox-api/board-provider.mock.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { SessionPool } from '../../inbox-opencode/session-pool.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import type { MutationProposal, ChatTurn } from '../../inbox-chat/types.ts';

/** @purpose Node id OpenCodeMock derives from `format.schema.title`, matching ChatSession's resultSchema (mirrors chat-session.test.ts, chat.router.test.ts). */
const CHAT_TURN_NODE_ID = 'chat_turn';

// #region START_REAL_EVENTSOURCE_POLYFILL — invariant: the test env's Node process has global
// `fetch` (Node 22) but not global `EventSource` without --experimental-eventsource; `ChatApiClient`
// is never edited to accept an injected EventSource, so a *real* standards-compliant implementation
// (undici — the same one Node's own --experimental-eventsource flag wires up) is installed on
// `globalThis` before the SUT is imported, per policy ("real Node ones or a real polyfill, NOT a
// hand-fake").
if (typeof globalThis.EventSource === 'undefined') {
  const { EventSource } = await import('undici');
  (globalThis as unknown as { EventSource: unknown }).EventSource = EventSource;
}
// #endregion END_REAL_EVENTSOURCE_POLYFILL

const { ChatApiClient } = await import('../services/chat-api-client.ts');

/** @purpose Seed `review.json` on disk with one finding at a given revision, matching MutationApplier's on-disk shape (mirrors mutate.router.test.ts). */
async function seedReviewDocument(
  stateDir: string,
  mrRef: string,
  revision: number
): Promise<string> {
  const dir = mrReportsDir(stateDir, mrRef);
  await mkdir(dir, { recursive: true });
  const filePath = `${dir}/review.json`;
  const document = {
    verdict: 'changes_requested',
    findings: [{ id: 'C-1', severity: 'major', file: 'a.ts', line: 1, message: 'fix me' }],
    revision,
  };
  await writeFile(filePath, JSON.stringify(document, null, 2), 'utf-8');
  return filePath;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ChatApiClient integration (real HttpServer, real fetch, real EventSource)', () => {
  // ChatApiClient hardcodes BASE_URL = http://localhost:4174 (same as HttpServer's default port,
  // matching ApiClient's convention) — the real server under test must listen there too, there is
  // no injection point to point the client elsewhere.
  const PORT = 4174;
  let stateDir: string;
  let server: HttpServer;
  let openCodeMock: OpenCodeMock;
  let client: InstanceType<typeof ChatApiClient>;

  before(async () => {
    stateDir = makeTestTmpDir('chat-api-client-integration-');
    const store = new StateStore(stateDir);
    openCodeMock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 5, opencode: openCodeMock });
    server = new HttpServer({
      port: PORT,
      boardProvider: new BoardProviderMock(),
      chat: { pool, store },
    });
    await server.start();
    client = new ChatApiClient();
  });

  after(async () => {
    await server.stop();
    cleanupTestTmp(stateDir);
  });

  it('subscribes over a real SSE stream and receives real token + turn_done frames for a posted turn', async () => {
    const mrRef = 'group/proj!930';
    openCodeMock.seed(CHAT_TURN_NODE_ID, { answer: 'real answer', mutations: [] });

    const tokens: string[] = [];
    let doneTurn: ChatTurn | null = null;
    let sawError: unknown = null;

    const unsubscribe = client.subscribe(mrRef, {
      onToken: (token) => tokens.push(token),
      onTurnDone: (turn) => {
        doneTurn = turn;
      },
      onError: (error, detail) => {
        sawError = { error, detail };
      },
    });

    try {
      // real EventSource connect latency before the turn is posted — no replay buffer in SseHub,
      // so the subscription must genuinely be open before the turn streams (mirrors the raw-SSE
      // client's `waitForNext()` for the initial `retry:` hint in chat.router.test.ts)
      await wait(300);

      await client.postTurn(mrRef, { text: 'what does this MR do?' });

      const deadline = Date.now() + 5_000;
      while (doneTurn === null && Date.now() < deadline) {
        await wait(25);
      }

      assert.strictEqual(sawError, null, `unexpected SSE error frame: ${JSON.stringify(sawError)}`);
      assert.ok(tokens.length > 0, 'expected at least one real token frame over the SSE stream');
      assert.ok(
        tokens.join('').includes('real answer'),
        'streamed tokens should carry the seeded answer'
      );
      assert.ok(doneTurn !== null, 'expected a real turn_done frame');
      assert.strictEqual((doneTurn as unknown as ChatTurn).answer, 'real answer');
    } finally {
      unsubscribe();
    }
  });

  it('applies a real mutate over real on-disk review.json (200) then rejects a stale revision (409, bytes unchanged)', async () => {
    const mrRef = 'group/proj!931';
    const reviewPath = await seedReviewDocument(stateDir, mrRef, 0);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const firstResult = await client.mutate(mrRef, proposal, 0);
    assert.strictEqual(firstResult.ok, true);
    if (firstResult.ok) {
      assert.strictEqual(firstResult.revision, 1);
      assert.ok(firstResult.snapshot.length > 0);
    }

    const bytesAfterFirst = await readFile(reviewPath, 'utf-8');

    // stale: on-disk revision is now 1, but this call still claims revision 0
    const staleResult = await client.mutate(mrRef, proposal, 0);
    assert.deepStrictEqual(staleResult, { ok: false, error: 'STALE_REVISION' });

    const bytesAfterStale = await readFile(reviewPath, 'utf-8');
    assert.strictEqual(
      bytesAfterStale,
      bytesAfterFirst,
      'review.json must be byte-for-byte unchanged after a real 409 STALE_REVISION'
    );
  });
});
