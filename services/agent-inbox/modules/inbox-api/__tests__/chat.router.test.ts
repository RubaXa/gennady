// @file: Integration tests for ChatRouter — async POST /chat (D-89), TURN_IN_FLIGHT rejection
//   (D-104), and POST /chat/stop delegation to ChatSession#stop (CH-11).
// @consumers: node:test runner
// @tasks: TSK-129

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { SessionPool } from '../../inbox-opencode/session-pool.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { PromptOpts } from '../../inbox-opencode/opencode.port.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';

/** @purpose Node id OpenCodeMock derives from `format.schema.title`, matching ChatSession's resultSchema (mirrors chat-session.test.ts). */
const CHAT_TURN_NODE_ID = 'chat_turn';

/** @purpose Helper to POST a JSON body and collect the response. */
function postJson(
  path: string,
  port: number,
  body: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/** @purpose One connected SSE test client — reads server-pushed chunks in arrival order. */
type SseTestClient = {
  waitForNext(): Promise<string>;
  destroy(): void;
};

/** @purpose Open a raw SSE connection against `/chat/stream` and expose ordered chunk reads. */
function connectSseClient(port: number, mrRef: string): Promise<SseTestClient> {
  return new Promise((resolveClient, rejectClient) => {
    const buffered: string[] = [];
    const pending: Array<(chunk: string) => void> = [];

    const req = request(
      { hostname: 'localhost', port, path: `/api/mr/${encodeURIComponent(mrRef)}/chat/stream` },
      (res) => {
        res.on('data', (buf: Buffer) => {
          const text = buf.toString('utf-8');
          const resolvePending = pending.shift();
          if (resolvePending) resolvePending(text);
          else buffered.push(text);
        });
        resolveClient({
          waitForNext: () =>
            buffered.length > 0
              ? Promise.resolve(buffered.shift() as string)
              : new Promise<string>((r) => pending.push(r)),
          destroy: () => req.destroy(),
        });
      }
    );
    req.on('error', rejectClient);
    req.end();
  });
}

// ── unified context ──

type ChatRouterContext = {
  stateDir: string;
  server: HttpServer;
  port: number;
  openCodeMock: OpenCodeMock;
  pool: SessionPool;
};

/** @purpose One lifecycle context per case: a real HttpServer with the chat bridge wired to a real SessionPool over a real (temp) StateStore — only opencode itself is a mock (genuinely external, per node-test rules). */
async function createChatRouterContext(port: number): Promise<ChatRouterContext> {
  const stateDir = makeTestTmpDir('chat-router-');
  const store = new StateStore(stateDir);
  const openCodeMock = new OpenCodeMock();
  const pool = new SessionPool({ maxSessions: 5, opencode: openCodeMock });
  const server = new HttpServer({
    port,
    boardProvider: new BoardProviderMock(),
    chat: { pool, store },
  });
  await server.start();
  return { stateDir, server, port, openCodeMock, pool };
}

async function destroyChatRouterContext(ctx: ChatRouterContext): Promise<void> {
  await ctx.server.stop();
  cleanupTestTmp(ctx.stateDir);
}

describe('ChatRouter — POST /chat', () => {
  let ctx: ChatRouterContext;
  const PORT = 4205;

  before(async () => {
    ctx = await createChatRouterContext(PORT);
  });

  after(async () => {
    await destroyChatRouterContext(ctx);
  });

  it('POST /chat не блокирует ответ', async () => {
    // invariant: the 202 response must arrive well before ChatSession.ask()'s simulated turn resolves (D-89)
    const mrRef = 'group/proj!10';
    ctx.openCodeMock.seed(CHAT_TURN_NODE_ID, { answer: 'slow answer', mutations: [] });
    const originalPrompt = ctx.pool.prompt.bind(ctx.pool);
    mock.method(ctx.pool, 'prompt', async (sid: string, opts: PromptOpts) => {
      await new Promise((r) => setTimeout(r, 300));
      return originalPrompt(sid, opts);
    });

    const started = performance.now();
    const { status, data } = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/chat`, PORT, {
      text: 'question one',
    });
    const elapsedMs = performance.now() - started;

    assert.strictEqual(status, 202);
    assert.deepStrictEqual(data, { ok: true });
    assert.ok(elapsedMs < 150, `expected fast 202, took ${elapsedMs}ms`);
  });

  it('POST /chat при in-flight ходе', async () => {
    const mrRef = 'group/proj!11';
    ctx.openCodeMock.seed(CHAT_TURN_NODE_ID, { answer: 'slow answer', mutations: [] });
    const originalPrompt = ctx.pool.prompt.bind(ctx.pool);
    mock.method(ctx.pool, 'prompt', async (sid: string, opts: PromptOpts) => {
      await new Promise((r) => setTimeout(r, 150));
      return originalPrompt(sid, opts);
    });

    const first = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/chat`, PORT, {
      text: 'question one',
    });
    const second = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/chat`, PORT, {
      text: 'question two',
    });

    assert.strictEqual(first.status, 202);
    assert.strictEqual(second.status, 409);
    const secondBody = second.data as { ok: boolean; error: string; detail: string };
    assert.strictEqual(secondBody.ok, false);
    assert.strictEqual(secondBody.error, 'TURN_IN_FLIGHT');
    assert.match(secondBody.detail, /^Turn already in flight on sid=/);
  });
});

describe('ChatRouter — POST /chat/stop', () => {
  let ctx: ChatRouterContext;
  const PORT = 4206;

  before(async () => {
    ctx = await createChatRouterContext(PORT);
  });

  after(async () => {
    await destroyChatRouterContext(ctx);
  });

  it('Stop делегирует ChatSession.stop', async () => {
    // observation focus: ack latency (<200ms, CH-11) + the eventual turn_done frame carrying
    // `stopped: true`, which is only possible if the router truly delegated to ChatSession#stop
    const mrRef = 'group/proj!12';
    ctx.openCodeMock.seed(CHAT_TURN_NODE_ID, { answer: 'one two three four five', mutations: [] });

    const streamClient = await connectSseClient(PORT, mrRef);
    await streamClient.waitForNext(); // initial `retry:` hint

    void postJson(`/api/mr/${encodeURIComponent(mrRef)}/chat`, PORT, { text: 'stop me' });
    await streamClient.waitForNext(); // first `token` frame confirms the turn is streaming

    const stopStart = performance.now();
    const { status, data } = await postJson(
      `/api/mr/${encodeURIComponent(mrRef)}/chat/stop`,
      PORT,
      {}
    );
    const stopElapsedMs = performance.now() - stopStart;

    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data, { ok: true });
    assert.ok(stopElapsedMs < 200, `expected fast stop ack, took ${stopElapsedMs}ms`);

    // #region START_AWAIT_TURN_DONE_STOPPED — invariant: the turn eventually settles as stopped, proving stop() reached ChatSession
    let frame = '';
    while (!frame.startsWith('event: turn_done')) {
      frame = await streamClient.waitForNext();
    }
    const payload = JSON.parse(frame.split('data: ')[1] ?? '{}') as {
      turn: { stopped?: boolean };
    };
    assert.strictEqual(payload.turn.stopped, true);
    // #endregion END_AWAIT_TURN_DONE_STOPPED

    streamClient.destroy();
  });
});
