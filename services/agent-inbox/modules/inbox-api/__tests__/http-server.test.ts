// @file: Integration tests for HttpServer — SPA fallback, graceful shutdown, CORS preflight.
// @consumers: node:test runner
// @tasks: TSK-106, TSK-167

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';

/** @purpose Helper to make an HTTP request and collect response as text. */
function fetchText(
  path: string,
  port: number,
  opts?: { method?: string; headers?: Record<string, string> }
): Promise<{ status: number; data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method: opts?.method ?? 'GET',
        headers: opts?.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            data: Buffer.concat(chunks).toString('utf-8'),
            headers: res.headers as Record<string, string>,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('HttpServer — SPA fallback', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    const listeningPort = server.listeningPort();
    if (!listeningPort) throw new Error('SPA fallback test server did not bind a TCP port');
    port = listeningPort;
  });

  after(async () => {
    await server.stop();
  });

  it('returns 200 with HTML body for unknown non-API routes (SPA fallback)', async () => {
    const { status, data, headers } = await fetchText('/some-page', port);

    assert.strictEqual(status, 200);
    assert.ok(headers['content-type']?.includes('text/html'), 'Content-Type should be text/html');
    assert.ok(data.includes('</html>'), 'Response should contain HTML');
  });

  it('returns 404 for unknown API routes', async () => {
    const { status, data } = await fetchText('/api/unknown', port);

    assert.strictEqual(status, 404);

    const body = JSON.parse(data) as { error: { code: string; message: string; anchor?: string } };
    assert.deepStrictEqual(body, {
      error: { code: 'not_found', message: 'Unknown API route' },
    });
  });

  it('handles CORS preflight (OPTIONS)', async () => {
    const { status, headers } = await fetchText('/api/board', port, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });

    assert.strictEqual(status, 204);
    assert.ok(headers['access-control-allow-origin']?.includes('localhost:5173'));
  });
});

describe('HttpServer — graceful shutdown', () => {
  it('start and stop succeed without errors', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: 0, boardProvider: provider });

    await server.start();
    const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');

    // Verify the server responds
    const { status } = await fetchText('/api/board', port);
    assert.strictEqual(status, 200);

    await server.stop();

    // After stop, new requests should fail
    try {
      await fetchText('/api/board', port);
      assert.fail('Expected request to fail after server stop');
    } catch {
      // Expected: connection refused
    }
  });

  it('active requests are handled during shutdown', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: 0, boardProvider: provider });

    await server.start();
    const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');

    // Start a request — it will have an active connection
    const requestPromise = fetchText('/api/board', port);

    // Wait a small tick for the request to establish connection
    await new Promise((r) => setTimeout(r, 50));

    // Now stop — existing connection should still complete
    await server.stop();

    const { status } = await requestPromise;
    assert.strictEqual(status, 200);
  });

  it('double stop is safe', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: 0, boardProvider: provider });

    await server.start();
    await server.stop();
    // Second stop should not throw
    await server.stop();
  });

  it('double start is a safe no-op (bootstrap may call start after boot)', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: 0, boardProvider: provider });

    await server.start();
    const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');

    // Re-start must not rebind or fail — bootstrap owns the live server acquired during boot.
    await server.start();
    assert.strictEqual(server.listeningPort(), port);

    const { status } = await fetchText('/api/board', port);
    assert.strictEqual(status, 200);
    await server.stop();
  });
});

describe('HttpServer — live VCS board truth (TSK-158)', () => {
  it('serves canonical running work from the durable journal without external VCS calls', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-board-work-'));
    const journal = new EventJournal(join(stateDir, 'events.jsonl'));
    const registry = new InboxRegistryAccess(stateDir);
    const snapshot: SyncSnapshot = {
      mr: {
        iid: '162',
        project: 'group/api',
        webUrl: 'https://gitlab.example.com/group/api/-/merge_requests/162',
        title: 'canonical API card',
        description: '',
        author: 'alice',
        reviewers: ['bob'],
        approvedBy: [],
        updatedAt: '2026-08-08T00:00:00.000Z',
        draft: false,
        state: 'opened',
        role: 'reviewer',
        events: [],
        directlyAddressed: false,
        todoIds: [],
      },
      role: 'reviewer',
      attention: '⏳',
      stage: 'review_needed',
      approvals: { n: 0, m: 1, approvedBy: [] },
      reviewers: ['bob'],
      ci: { status: 'pending' },
      threads: { open: 0, total: 0, awaitingMe: 0 },
      headSha: 'head-162',
      lastReviewedHeadSha: null,
      updatedAt: '2026-08-08T00:00:00.000Z',
      estimated: false,
    };
    await journal.append({
      ts: '2026-08-08T00:00:01.000Z',
      mr: 'group/api!162',
      kind: 'task_created',
      actor: 'queue',
      payload: { taskId: '#162', type: 'review' },
    });
    await journal.append({
      ts: '2026-08-08T00:00:02.000Z',
      mr: 'group/api!162',
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#162', status: 'running' },
    });
    const server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: {
        queue: new InMemoryTaskQueue(new TaskRegistry()),
        decisionJournal: new DecisionJournal(journal),
        journal,
        registry,
        snapshots: [snapshot],
      },
    });

    await server.start();
    const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
    try {
      const { status, data } = await fetchText('/api/board', port);
      const payload = JSON.parse(data) as {
        cards: Array<{
          ref: string;
          author: string;
          myRole: string | null;
          work: Record<string, unknown>;
        }>;
      };
      assert.strictEqual(status, 200);
      assert.deepStrictEqual(payload.cards[0], {
        ref: 'group/api!162',
        title: 'canonical API card',
        author: 'alice',
        myRole: 'reviewer',
        attention: '⏳',
        counters: {
          approvals: '0/1',
          reviewers: [{ user: 'bob', voted: false }],
          ci: 'pending',
          threads: '0/0',
          awaitingMe: 0,
          newCommits: 0,
          unread: 0,
        },
        work: {
          state: 'running',
          label: 'review',
          taskId: '#162',
          startedAt: '2026-08-08T00:00:02.000Z',
        },
      });
    } finally {
      await server.stop();
    }
  });

  it('refreshes /api/board from the configured SyncService source instead of the legacy provider', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-live-board-'));
    const journal = new EventJournal(join(stateDir, 'events.jsonl'));
    const registry = new InboxRegistryAccess(stateDir);
    let sourceCalls = 0;
    const snapshot: SyncSnapshot = {
      mr: {
        iid: '158',
        project: 'group/live-project',
        webUrl: 'https://gitlab.example.com/group/live-project/-/merge_requests/158',
        title: 'authoritative VCS title',
        description: '',
        author: 'alice',
        reviewers: ['bob'],
        approvedBy: [],
        updatedAt: '2026-08-08T00:00:00.000Z',
        draft: false,
        state: 'opened',
        role: 'reviewer',
        events: [],
        directlyAddressed: false,
        todoIds: [],
      },
      role: 'reviewer',
      attention: '⏳',
      stage: 'review_needed',
      approvals: { n: 0, m: 1, approvedBy: [] },
      reviewers: ['bob'],
      ci: { status: 'pending' },
      threads: { open: 0, total: 0, awaitingMe: 0 },
      headSha: 'head-158',
      lastReviewedHeadSha: null,
      updatedAt: '2026-08-08T00:00:00.000Z',
      estimated: false,
    };
    const server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: {
        queue: new InMemoryTaskQueue(new TaskRegistry()),
        decisionJournal: new DecisionJournal(journal),
        journal,
        registry,
        snapshots: [],
        loadSnapshots: async () => {
          sourceCalls += 1;
          return [snapshot];
        },
      },
    });

    await server.start();
    const port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
    try {
      // Stale-while-revalidate contract: the first request serves the (empty) cache instantly
      // and triggers the authoritative load in the background…
      const first = await fetchText('/api/board', port);
      const firstPayload = JSON.parse(first.data) as { cards: unknown[]; syncState: string };
      assert.strictEqual(first.status, 200);
      assert.strictEqual(firstPayload.cards.length, 0);
      assert.strictEqual(firstPayload.syncState, 'syncing');

      // …the background load settles into the projection cache (poll past the loader's
      // resolution — snapshot installation trails the sourceCalls increment by a microtask)…
      const deadline = Date.now() + 5000;
      let status = 0;
      let data = '';
      let payload: {
        cards: Array<{
          title: string;
          ref: string;
          author: string;
          myRole: string | null;
          work: { state: string };
        }>;
        syncState: string;
      } = { cards: [], syncState: 'syncing' };
      while (Date.now() < deadline) {
        ({ status, data } = await fetchText('/api/board', port));
        payload = JSON.parse(data) as typeof payload;
        if (payload.cards.length === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.strictEqual(sourceCalls, 1);
      assert.strictEqual(status, 200);
      assert.strictEqual(payload.cards.length, 1);
      assert.strictEqual(payload.syncState, 'ok');
      assert.strictEqual(payload.cards[0]?.title, 'authoritative VCS title');
      assert.strictEqual(payload.cards[0]?.ref, 'group/live-project!158');
      assert.strictEqual(payload.cards[0]?.author, 'alice');
      assert.strictEqual(payload.cards[0]?.myRole, 'reviewer');
    } finally {
      await server.stop();
    }
  });
});
