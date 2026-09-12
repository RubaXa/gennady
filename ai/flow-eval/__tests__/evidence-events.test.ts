// @file: Both-outcomes proof for GAP-E-1b — readEvents is wired to a REAL event stream instead of the
//   dead `async () => []` default (evidence.ts, previously constructed at cli.ts:281-284 with no
//   `readEvents` option at all). No live LLM/OpenCode server is used: a local `node:http` server speaks
//   the same SSE wire format the OpenCode SDK's `.event.subscribe()` parses (`data: <json>\n\n`), and
//   this exercises the REAL public interface — `SddEvalOpenCodeEvidenceSource.readEvents` — the same
//   one cli.ts and observer.ts call, not an internal helper.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createSddEvalOpenCodeClient } from '../opencode-client.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalObserver } from '../observer.ts';
import type { OpencodeClient } from '@opencode-ai/sdk';

/** @purpose Serve `/event` as SSE with the given raw lines (each entry becomes one `data:` frame), then
 *   end the response — the SDK's SSE client treats a natural stream end as normal completion, not error. */
function startSseServer(events: readonly unknown[]): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      if (req.url !== '/event') {
        res.writeHead(404).end();
        return;
      }
      // `Connection: close` (not keep-alive): this is a short-lived per-test server, and an
      // undici-pooled keep-alive socket would otherwise hold the test process's event loop open
      // longer than needed even after every assertion has already passed.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'close',
      });
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise) => {
    server.closeAllConnections?.();
    server.close(() => resolvePromise());
  });
}

/**
 * @purpose Build a REAL evidence source whose event stream hits the local SSE server, while
 *   readTail/readStatus/readDiff go through a minimal fake `session.*` (the fake server above only
 *   speaks `/event`) — mirroring how harness.test.ts fakes just the SDK surface each test needs.
 *   Bound to the test's own AbortController: without an explicit abort, closing the server WHILE the
 *   background subscription is still connecting races into the SDK SSE client's indefinite
 *   exponential-backoff retry (no default max attempts) — a real defect this same GAP-E-1b fix
 *   addresses in evidence.ts (`sseMaxRetryAttempts: 3` + an accepted `signal`). Aborting BEFORE
 *   closing the server is the same shutdown order production (cli.ts) uses.
 */
function makeEvidence(baseUrl: string): {
  evidence: SddEvalOpenCodeEvidenceSource;
  stop: () => void;
} {
  const controller = new AbortController();
  const realEvent = createSddEvalOpenCodeClient({ baseUrl }).event;
  const client = {
    event: realEvent,
    session: {
      messages: async () => ({ data: [] }),
      children: async () => ({ data: [] }),
      status: async () => ({ data: {} }),
      diff: async () => ({ data: [] }),
    },
  } as unknown as OpencodeClient;
  const evidence = new SddEvalOpenCodeEvidenceSource({
    client,
    directory: '/tmp',
    eventSignal: controller.signal,
  });
  return { evidence, stop: () => controller.abort() };
}

/** @purpose Poll `check()` until it returns a truthy value or the bound is hit; avoids a fixed sleep
 *   racing the reader's fire-and-forget subscription start. */
async function waitFor<T>(check: () => Promise<T> | T, boundMs = 2000, stepMs = 20): Promise<T> {
  const deadline = Date.now() + boundMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, stepMs));
  }
}

describe('GAP-E-1b: SddEvalOpenCodeEvidenceSource.readEvents (both-way, local node:http SSE — no live LLM)', () => {
  it('a stream with permission.asked + session.waiting yields readEvents(S) non-empty with EXACTLY those types', async () => {
    const { server, baseUrl } = await startSseServer([
      { type: 'permission.asked', properties: { sessionID: 'ses_S' } },
      { type: 'session.waiting', properties: { sessionID: 'ses_S' } },
    ]);
    const { evidence, stop } = makeEvidence(baseUrl);
    try {
      const events = await waitFor(async () => {
        const result = await evidence.readEvents('ses_S');
        return result.length > 0 ? result : undefined;
      });
      assert.ok(events, 'readEvents never returned any events within the bound');
      assert.deepEqual(
        new Set(events!.map((event) => event.type)),
        new Set(['permission.asked', 'session.waiting'])
      );
      assert.ok(events!.every((event) => event.sessionId === 'ses_S'));
    } finally {
      stop();
      await closeServer(server);
    }
  });

  it('an empty stream yields readEvents(S) === [] (never throws, never fabricates an event)', async () => {
    const { server, baseUrl } = await startSseServer([]);
    const { evidence, stop } = makeEvidence(baseUrl);
    try {
      // Give the (empty) stream a moment to be drained, then confirm it STAYS empty (not just "not yet").
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
      const events = await evidence.readEvents('ses_S');
      assert.deepEqual(events, []);
    } finally {
      stop();
      await closeServer(server);
    }
  });

  it('events for a DIFFERENT session never leak into this session’s buffer', async () => {
    const { server, baseUrl } = await startSseServer([
      { type: 'permission.updated', properties: { sessionID: 'ses_other' } },
    ]);
    const { evidence, stop } = makeEvidence(baseUrl);
    try {
      await waitFor(async () => {
        const other = await evidence.readEvents('ses_other');
        return other.length > 0 ? other : undefined;
      });
      assert.deepEqual(await evidence.readEvents('ses_S'), []);
    } finally {
      stop();
      await closeServer(server);
    }
  });
});

describe('GAP-E-1b: SddEvalObserver.observe() waiting flag driven by the live reader', () => {
  it('a session with a live permission/waiting event observes waiting=true', async () => {
    const { server, baseUrl } = await startSseServer([
      { type: 'permission.asked', properties: { sessionID: 'ses_wait' } },
    ]);
    const { evidence, stop } = makeEvidence(baseUrl);
    try {
      const observer = new SddEvalObserver(evidence, { everyMs: 0, stuckAfter: 3, tailLimit: 4 });
      const observation = await waitFor(async () => {
        const obs = await observer.observe('ses_wait');
        return obs.waiting ? obs : undefined;
      });
      assert.ok(observation, 'observation never reported waiting=true within the bound');
      assert.equal(observation!.waiting, true);
    } finally {
      stop();
      await closeServer(server);
    }
  });

  it('a session with no live events observes waiting=false', async () => {
    const { server, baseUrl } = await startSseServer([]);
    const { evidence, stop } = makeEvidence(baseUrl);
    try {
      const observer = new SddEvalObserver(evidence, { everyMs: 0, stuckAfter: 3, tailLimit: 4 });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
      const observation = await observer.observe('ses_no_wait');
      assert.equal(observation.waiting, false);
    } finally {
      stop();
      await closeServer(server);
    }
  });
});
