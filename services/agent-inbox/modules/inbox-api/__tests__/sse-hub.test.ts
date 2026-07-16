// @file: Tests for SseHub — SseFrame union exhaustiveness (contract), multi-subscriber broadcast
//   fan-out (D-100), and disconnect/unsubscribe safety (dead socket never blocks delivery).
// @consumers: node:test runner
// @tasks: TSK-129

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server, type ServerResponse } from 'node:http';
import { SseHub, type SseFrame } from '../sse-hub.ts';

/** @purpose One connected SSE test client — reads server-pushed chunks in arrival order. */
type SseTestClient = {
  waitForNext(): Promise<string>;
  destroy(): void;
};

/** @purpose Open a raw SSE connection against the test server and expose ordered chunk reads. */
function connectSseClient(port: number, mrRef: string): Promise<SseTestClient> {
  return new Promise((resolveClient, rejectClient) => {
    const buffered: string[] = [];
    const pending: Array<(chunk: string) => void> = [];

    const req = request(
      { hostname: 'localhost', port, path: `/stream?mr=${encodeURIComponent(mrRef)}` },
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

type SseHubTestContext = {
  hub: SseHub;
  port: number;
  serverResponses: ServerResponse[];
  server: Server;
};

/** @purpose One lifecycle context per case: a fresh SseHub behind a raw HTTP server that subscribes every incoming connection to `?mr=` and records the server-side ServerResponse for direct unsubscribe calls. */
function createSseHubContext(): Promise<SseHubTestContext> {
  const hub = new SseHub();
  const serverResponses: ServerResponse[] = [];

  const server = createServer((req, res) => {
    const mrRef = new URL(req.url ?? '/', 'http://localhost').searchParams.get('mr') ?? '';
    serverResponses.push(res);
    hub.subscribe(mrRef, res);
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ hub, port, serverResponses, server });
    });
  });
}

describe('SseHub', () => {
  let ctx: SseHubTestContext;

  beforeEach(async () => {
    ctx = await createSseHubContext();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  });

  describe('SseFrame union exhaustiveness', () => {
    it('Типизация ChatRouter/MutateRouter/SseHub', async () => {
      // contract: SseFrame is a closed discriminated union of every frame SseHub can broadcast;
      // failure mode: a new frame kind must be added to the union AND to `_encodeFrame`'s switch

      const token: SseFrame = { type: 'token', token: 'hi' };
      const turnDone: SseFrame = {
        type: 'turn_done',
        turn: {
          id: 't1',
          ts: new Date().toISOString(),
          question: 'q',
          chips: [],
          answer: 'a',
          reviewRevision: 0,
        },
      };
      const mutation: SseFrame = {
        type: 'mutation',
        mutation: { op: 'edit', target: 'C-1', before: 'a', after: 'b' },
      };
      const refresh: SseFrame = { type: 'refresh' };
      const errorFrame: SseFrame = { type: 'error', error: 'SESSION_ERROR', detail: 'boom' };
      // @ts-expect-error - SseFrame is a closed union; an unrecognized `type` must not compile
      const invalidFrame: SseFrame = { type: 'bogus' };

      const client = await connectSseClient(ctx.port, 'group/proj!1');
      await client.waitForNext(); // initial `retry:` hint

      // #region START_ALL_VARIANTS_BROADCAST_ENCODE — invariant: every variant round-trips through broadcast()->_encodeFrame() without throwing
      for (const frame of [token, turnDone, mutation, refresh, errorFrame]) {
        ctx.hub.broadcast('group/proj!1', frame);
        const chunk = await client.waitForNext();
        assert.match(chunk, new RegExp(`^event: ${frame.type}\\n`));
      }
      // #endregion END_ALL_VARIANTS_BROADCAST_ENCODE

      assert.strictEqual(invalidFrame.type, 'bogus');
      client.destroy();
    });
  });

  describe('broadcast — SSE-стрим вещает всем подписчикам MR', () => {
    it('SSE-стрим вещает всем подписчикам MR', async () => {
      const mrRef = 'group/proj!2';
      const clientA = await connectSseClient(ctx.port, mrRef);
      const clientB = await connectSseClient(ctx.port, mrRef);
      await clientA.waitForNext();
      await clientB.waitForNext();

      ctx.hub.broadcast(mrRef, { type: 'refresh' });

      const [chunkA, chunkB] = await Promise.all([clientA.waitForNext(), clientB.waitForNext()]);
      assert.match(chunkA, /^event: refresh\n/);
      assert.match(chunkB, /^event: refresh\n/);

      clientA.destroy();
      clientB.destroy();
    });
  });

  describe('unsubscribe — Разрыв соединения без исключения', () => {
    it('Разрыв соединения — unsubscribe без исключения', async () => {
      // failure mode: a dead/unsubscribed connection must not block delivery to the rest of the MR's subscribers
      const mrRef = 'group/proj!3';
      const clientA = await connectSseClient(ctx.port, mrRef);
      const clientB = await connectSseClient(ctx.port, mrRef);
      await clientA.waitForNext();
      await clientB.waitForNext();

      const resA = ctx.serverResponses[0] as ServerResponse;
      ctx.hub.unsubscribe(mrRef, resA);
      clientA.destroy();

      ctx.hub.broadcast(mrRef, { type: 'refresh' });
      const chunkB = await clientB.waitForNext();

      assert.match(chunkB, /^event: refresh\n/);
      clientB.destroy();
    });
  });
});
