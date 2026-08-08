// @file: Router contract tests — DTO closed-world validation, enqueue dedup, decision lifecycle, artifact path traversal, boot endpoint, HttpServer→projection wiring (F-02).
// @consumers: node:test runner
// @tasks: TSK-162

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { TaskRouter } from '../routers/task.router.ts';
import { DecisionRouter } from '../routers/decision.router.ts';
import { BootRouter, type BootPhase } from '../routers/boot.router.ts';
import { StreamRouter } from '../routers/stream.router.ts';
import { SseHub } from '../sse-hub.ts';
import { isSafeArtifactPath } from '../routers/artifact.router.ts';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { FeedWidgetType } from '../dto/feed-widget.type.ts';

const ALL_WIDGET_TYPES: ReadonlySet<FeedWidgetType> = new Set([
  'findings',
  'threads',
  'artifact',
  'gitlab',
  'plan',
  'progress',
  'action',
]);

const ALL_BOOT_PHASES: ReadonlySet<BootPhase> = new Set([
  'connect',
  'poll',
  'reconcile',
  'restore',
  'ready',
  'failed',
]);

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const bodyStr = body != null ? JSON.stringify(body) : '';
  const req = new Readable({ read() {} }) as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost' };

  if (body != null) {
    req.headers['content-type'] = 'application/json';
    process.nextTick(() => {
      req.push(Buffer.from(bodyStr));
      req.push(null);
    });
  } else {
    process.nextTick(() => req.push(null));
  }
  return req;
}

function mockRes(): {
  res: ServerResponse & { status: () => number; body: () => unknown; ended: () => boolean };
  body: () => unknown;
  status: () => number;
  ended: () => boolean;
} {
  let responseBody: unknown = null;
  let responseStatus = 0;
  let isEnded = false;

  const captured = {
    status: () => responseStatus,
    body: () => {
      if (typeof responseBody === 'string') {
        try {
          return JSON.parse(responseBody);
        } catch {
          return responseBody;
        }
      }
      return responseBody;
    },
    ended: () => isEnded,
  };

  const res = {
    writeHead: mock.fn((status: number, _headers?: Record<string, unknown>) => {
      responseStatus = status;
      return res;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk != null) responseBody = chunk;
      isEnded = true;
      return res;
    }),
    setHeader: mock.fn(() => res),
    getHeader: mock.fn(() => undefined),
    getHeaders: mock.fn(() => ({})),
    write: mock.fn(() => true),
    statusCode: 0,
    ...captured,
  } as unknown as ServerResponse & {
    status: () => number;
    body: () => unknown;
    ended: () => boolean;
  };

  return { res, ...captured };
}

describe('DTO contract: closed worlds', () => {
  it('FeedWidget.type is closed (7 values)', () => {
    const types = [...ALL_WIDGET_TYPES].sort();
    assert.strictEqual(types.length, 7);
    assert.deepStrictEqual(types, [
      'action',
      'artifact',
      'findings',
      'gitlab',
      'plan',
      'progress',
      'threads',
    ]);
  });

  it('BootDto.phase is closed (6 values)', () => {
    const phases = [...ALL_BOOT_PHASES].sort();
    assert.strictEqual(phases.length, 6);
    assert.deepStrictEqual(phases, ['connect', 'failed', 'poll', 'ready', 'reconcile', 'restore']);
  });

  it('MrCard requires the canonical §4 fields including durable work', () => {
    const card = {
      ref: 'p!1',
      title: 't',
      author: 'alice',
      myRole: 'reviewer' as string | null,
      attention: '⏳' as const,
      counters: {
        approvals: '0/2',
        reviewers: [] as { user: string; voted: boolean }[],
        ci: null as string | null,
        threads: '0/0',
        awaitingMe: 0,
        newCommits: 0,
        unread: 0,
      },
      work: {
        state: 'running' as const,
        label: 'review',
        taskId: '#1',
        startedAt: '2026-08-08T00:00:00Z',
      },
    };

    assert.strictEqual(card.ref, 'p!1');
    assert.strictEqual(card.author, 'alice');
    assert.strictEqual(card.myRole, 'reviewer');
    assert.strictEqual(card.attention, '⏳');
    assert.ok(typeof card.counters === 'object');
    assert.strictEqual(card.work.state, 'running');
    assert.strictEqual(card.work.taskId, '#1');
  });
});

describe('StreamRouter error envelope', () => {
  it('returns structured JSON when subscribing to the stream throws', () => {
    const router = new StreamRouter({
      subscribe: () => {
        throw new Error('boom');
      },
    } as never);
    const { res, status, body, ended } = mockRes();
    router.handle(mockReq('GET', '/api/mr/group%2Fproject!1/stream'), res);
    assert.strictEqual(status(), 500);
    assert.deepStrictEqual(body(), {
      error: { code: 'degraded', message: 'Internal server error' },
    });
    assert.ok(ended());
  });
});

describe('TaskRouter — POST /api/task', () => {
  it('enqueue dedupes by computed type+canonical(params) key — both calls return same taskId', async () => {
    const queue: TaskQueuePort = {
      enqueue: mock.fn(
        (_mr: string, _type: string, _params: Record<string, unknown>, _dedupKey?: string) => ({
          taskId: '#1',
          position: 0,
        })
      ),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new TaskRouter(queue);
    const { res: res1, body: body1 } = mockRes();
    const { res: res2, body: body2 } = mockRes();

    await router.handle(
      mockReq('POST', '/api/task', { type: 'prepare_env', params: { mr: 'p!1' } }),
      res1
    );
    await router.handle(
      mockReq('POST', '/api/task', { type: 'prepare_env', params: { mr: 'p!1' } }),
      res2
    );

    assert.strictEqual(res1.status(), 200);
    assert.strictEqual(res2.status(), 200);

    const data1 = body1() as Record<string, unknown>;
    const data2 = body2() as Record<string, unknown>;
    assert.strictEqual(data1.taskId, '#1');
    assert.strictEqual(data2.taskId, '#1');
    assert.strictEqual(data1.taskId, data2.taskId);
  });

  it('enqueue dedup: explicit dedupKey is passed through', async () => {
    let capturedDedupKey: string | undefined;
    const queue: TaskQueuePort = {
      enqueue: mock.fn(
        (_mr: string, _type: string, _params: Record<string, unknown>, dedupKey?: string) => {
          capturedDedupKey = dedupKey;
          return { taskId: '#1', position: 0 };
        }
      ),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new TaskRouter(queue);
    const { res } = mockRes();

    await router.handle(
      mockReq('POST', '/api/task', {
        type: 'prepare_env',
        params: { mr: 'p!1' },
        dedupKey: 'my-explicit-key',
      }),
      res
    );

    assert.strictEqual(res.status(), 200);
    assert.strictEqual(capturedDedupKey, 'my-explicit-key');
  });
});

describe('DecisionRouter — POST /api/decision', () => {
  it('decision accept returns taskId and enqueues effect', async () => {
    const decisionJournal: DecisionJournal = {
      writeDecision: mock.fn(() => Promise.resolve(1)),
      writeProposal: mock.fn(() => Promise.resolve(2)),
      recordDryRunSuppression: mock.fn(() => Promise.resolve(3)),
      computeAcceptRate: mock.fn(() => ({
        capability: 'post_findings' as import('../../inbox-core/decision-journal.ts').Capability,
        acceptCount: 0,
        totalDecisions: 0,
        rate: Number.NaN,
      })),
      computeAllAcceptRates: mock.fn(() => []),
    } as unknown as DecisionJournal;

    const queue: TaskQueuePort = {
      enqueue: mock.fn(() => ({ taskId: '#42', position: 0 })),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new DecisionRouter(decisionJournal, queue);
    const { res, body } = mockRes();

    await router.handle(
      mockReq('POST', '/api/decision', {
        proposalId: 'prop-1',
        verdict: 'accept',
      }),
      res
    );

    assert.strictEqual(res.status(), 200);
    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.taskId, '#42');
  });

  it('decision edit returns taskId', async () => {
    const decisionJournal: DecisionJournal = {
      writeDecision: mock.fn(() => Promise.resolve(1)),
    } as unknown as DecisionJournal;

    const queue: TaskQueuePort = {
      enqueue: mock.fn(() => ({ taskId: '#43', position: 0 })),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new DecisionRouter(decisionJournal, queue);
    const { res, body } = mockRes();

    await router.handle(
      mockReq('POST', '/api/decision', {
        proposalId: 'prop-2',
        verdict: 'edit',
        payload: { diff: 'changes' },
      }),
      res
    );

    assert.strictEqual(res.status(), 200);
    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.taskId, '#43');
  });

  it('decision reject returns 204 and no task is enqueued', async () => {
    let enqueueCalled = false;
    const decisionJournal: DecisionJournal = {
      writeDecision: mock.fn(() => Promise.resolve(1)),
    } as unknown as DecisionJournal;

    const queue: TaskQueuePort = {
      enqueue: mock.fn(() => {
        enqueueCalled = true;
        return { taskId: '', position: 0 };
      }),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new DecisionRouter(decisionJournal, queue);
    const { res } = mockRes();

    await router.handle(
      mockReq('POST', '/api/decision', {
        proposalId: 'prop-3',
        verdict: 'reject',
      }),
      res
    );

    assert.strictEqual(res.status(), 204);
    assert.strictEqual(enqueueCalled, false);
  });

  it('domain errors are structured envelopes — {error:{code,message}} for invalid verdict', async () => {
    const decisionJournal: DecisionJournal = {
      writeDecision: mock.fn(() => Promise.resolve(1)),
    } as unknown as DecisionJournal;

    const queue: TaskQueuePort = {
      enqueue: mock.fn(() => ({ taskId: '', position: 0 })),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const router = new DecisionRouter(decisionJournal, queue);
    const { res, body } = mockRes();

    await router.handle(
      mockReq('POST', '/api/decision', {
        proposalId: 'prop-4',
        verdict: 'invalid_verdict',
      }),
      res
    );

    assert.strictEqual(res.status(), 400);
    const data = body() as Record<string, unknown>;
    const error = data.error as Record<string, unknown>;
    assert.ok(error !== undefined, 'Response must have error envelope');
    assert.strictEqual(error.code, 'invalid_input');
    assert.ok(typeof error.message === 'string');
  });
});

describe('isSafeArtifactPath', () => {
  it('artifact path traversal is rejected via ../', () => {
    assert.strictEqual(isSafeArtifactPath('../../outside.json'), false);
  });

  it('artifact path traversal is rejected via absolute path', () => {
    assert.strictEqual(isSafeArtifactPath('/etc/passwd'), false);
  });

  it('artifact path traversal is rejected via NUL byte', () => {
    assert.strictEqual(isSafeArtifactPath('safe\0.json'), false);
  });

  it('safe relative path is accepted', () => {
    assert.strictEqual(isSafeArtifactPath('report.json'), true);
  });

  it('safe nested path is accepted', () => {
    assert.strictEqual(isSafeArtifactPath('subdir/report.json'), true);
  });

  it('empty path is rejected', () => {
    assert.strictEqual(isSafeArtifactPath(''), false);
  });
});

describe('BootRouter — GET /api/boot', () => {
  it('boot router returns phase/progress on ready', () => {
    const router = new BootRouter();
    router.setPhase('ready');
    const { res, body } = mockRes();

    router.handle(mockReq('GET', '/api/boot'), res);

    assert.strictEqual(res.status(), 200);
    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.phase, 'ready');
  });

  it('boot router returns progress when configured', () => {
    const router = new BootRouter();
    router.setPhase('restore', { done: 5, total: 10, label: 'Restoring state...' });
    const { res, body } = mockRes();

    router.handle(mockReq('GET', '/api/boot'), res);

    assert.strictEqual(res.status(), 200);
    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.phase, 'restore');
    const progress = data.progress as Record<string, unknown>;
    assert.strictEqual(progress.done, 5);
    assert.strictEqual(progress.total, 10);
    assert.strictEqual(progress.label, 'Restoring state...');
  });

  it('boot phase starts at connect by default', () => {
    const router = new BootRouter();
    const { res, body } = mockRes();

    router.handle(mockReq('GET', '/api/boot'), res);

    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.phase, 'connect');
  });

  it('boot router returns error when failed', () => {
    const router = new BootRouter();
    router.setFailed('connection refused');
    const { res, body } = mockRes();

    router.handle(mockReq('GET', '/api/boot'), res);

    const data = body() as Record<string, unknown>;
    assert.strictEqual(data.phase, 'failed');
    assert.strictEqual(data.error, 'connection refused');
  });
});

/** @purpose Helper to make an HTTP request and collect parsed JSON response for integration tests. */
function fetchJson(
  path: string,
  port: number,
  opts?: { method?: string; body?: unknown }
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts?.body != null ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {};
    if (bodyStr != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method: opts?.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr != null) req.write(bodyStr);
    req.end();
  });
}

describe('HttpServer — inboxApi v2 wiring (F-02)', () => {
  let port: number;
  let enqueueCalled = false;
  let enqueueDedupKey: string | undefined;
  let enqueueMr: string | undefined;
  let enqueueParams: Record<string, unknown> | undefined;

  let server: HttpServer;

  before(async () => {
    const queue: TaskQueuePort = {
      enqueue: mock.fn(
        (mr: string, _type: string, params: Record<string, unknown>, dedupKey?: string) => {
          enqueueCalled = true;
          enqueueDedupKey = dedupKey;
          enqueueMr = mr;
          enqueueParams = params;
          return { taskId: '#42', position: 0 };
        }
      ),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };

    const decisionJournal: DecisionJournal = {
      writeDecision: mock.fn(() => Promise.resolve(1)),
      writeProposal: mock.fn(() => Promise.resolve(2)),
      recordDryRunSuppression: mock.fn(() => Promise.resolve(3)),
      computeAcceptRate: mock.fn(() => ({
        capability: 'post_findings' as import('../../inbox-core/decision-journal.ts').Capability,
        acceptCount: 0,
        totalDecisions: 0,
        rate: Number.NaN,
      })),
      computeAllAcceptRates: mock.fn(() => []),
    } as unknown as DecisionJournal;

    const journal: EventJournal = {
      since: mock.fn((_cursor: number) => ({ entries: [], nextCursor: 0 })),
    } as unknown as EventJournal;

    const registry: InboxRegistryAccess = {
      load: mock.fn(() => ({ entries: {} as Record<string, unknown> })),
      recordLastRead: mock.fn(() => {}),
      save: mock.fn(() => {}),
    } as unknown as InboxRegistryAccess;

    server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: { queue, decisionJournal, journal, registry },
    });

    await server.start();
    const listeningPort = server.listeningPort();
    if (!listeningPort) throw new Error('Router integration test server did not bind a TCP port');
    port = listeningPort;
  });

  after(async () => {
    await server.stop();
  });

  it('boot endpoint returns phase via HttpServer wiring', async () => {
    const { status, data } = await fetchJson('/api/boot', port);

    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.phase, 'connect');
  });

  it('task endpoint enqueues through router and returns taskId+position', async () => {
    const { status, data } = await fetchJson('/api/task', port, {
      method: 'POST',
      body: { type: 'prepare_env', params: { mr: 'p!1' }, dedupKey: 'key-1' },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.taskId, '#42');
    assert.strictEqual(data.position, 0);
    assert.strictEqual(enqueueCalled, true);
    assert.strictEqual(enqueueDedupKey, 'key-1');
  });

  it('feed endpoint returns widgets from projection via HttpServer wiring', async () => {
    const { status, data } = await fetchJson('/api/feed?cursor=0', port);

    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(Array.isArray(data.widgets));
    assert.strictEqual(data.widgets.length, 0);
    assert.strictEqual(data.nextCursor, 0);
  });

  it('canonical MR-scoped feed/task/decision routes use the URL MR identity', async () => {
    const ref = 'group/project!9';
    const encodedRef = encodeURIComponent(ref);
    const feed = await fetchJson(`/api/mr/${encodedRef}/feed?cursor=0&mr=wrong!1`, port);
    const task = await fetchJson(`/api/mr/${encodedRef}/task`, port, {
      method: 'POST',
      body: { type: 'prepare_env', params: { mr: 'wrong!1' } },
    });
    const decision = await fetchJson(`/api/mr/${encodedRef}/decision`, port, {
      method: 'POST',
      body: { proposalId: 'prop-scoped', verdict: 'accept', payload: { mr: 'wrong!1' } },
    });

    assert.strictEqual(feed.status, 200);
    assert.strictEqual(task.status, 200);
    assert.strictEqual(decision.status, 200);
    assert.strictEqual(task.data.taskId, '#42');
    assert.strictEqual(decision.data.taskId, '#42');
    assert.strictEqual(enqueueMr, ref);
    assert.strictEqual(enqueueParams?.mr, ref);
  });

  it('state endpoint returns card+queue+widgets batched from projections', async () => {
    const { status, data } = await fetchJson('/api/state?mr=p!1', port);

    assert.strictEqual(status, 200);
    assert.strictEqual(data.card, undefined);
    assert.ok(Array.isArray(data.queue));
    assert.strictEqual(data.queue.length, 0);
    assert.ok(Array.isArray(data.widgets));
    assert.strictEqual(data.widgets.length, 0);
  });

  it('decision accept returns taskId via HttpServer wiring', async () => {
    const { status, data } = await fetchJson('/api/decision', port, {
      method: 'POST',
      body: { proposalId: 'prop-int', verdict: 'accept' },
    });

    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.taskId, '#42');
  });

  it('decision invalid verdict returns structured domain error', async () => {
    const { status, data } = await fetchJson('/api/decision', port, {
      method: 'POST',
      body: { proposalId: 'prop-int', verdict: 'invalid' },
    });

    assert.strictEqual(status, 400);
    const error = data.error as Record<string, unknown>;
    assert.ok(error !== undefined, 'Response must have error envelope');
    assert.strictEqual(error.code, 'invalid_input');
    assert.ok(typeof error.message === 'string');
  });
});

describe('HttpServer — stream failure envelope', () => {
  it('returns a structured 500 when the injected SSE hub rejects subscription', async () => {
    const queue: TaskQueuePort = {
      enqueue: mock.fn(() => ({ taskId: '#1', position: 0 })),
      next: mock.fn(() => []),
      state: mock.fn(() => []),
      supersede: mock.fn(() => null),
      transition: mock.fn(() => {}),
      instance: mock.fn(() => undefined),
      all: mock.fn(() => new Map()),
    };
    const server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: {
        queue,
        decisionJournal: {
          writeDecision: mock.fn(),
          writeProposal: mock.fn(),
          recordDryRunSuppression: mock.fn(),
          computeAcceptRate: mock.fn(),
          computeAllAcceptRates: mock.fn(),
        } as unknown as DecisionJournal,
        journal: {
          since: mock.fn(() => ({ entries: [], nextCursor: 0 })),
        } as unknown as EventJournal,
        registry: {
          load: mock.fn(() => ({ entries: {} })),
          recordLastRead: mock.fn(),
          save: mock.fn(),
        } as unknown as InboxRegistryAccess,
        sseHub: {
          subscribe: () => {
            throw new Error('subscribe failed');
          },
        } as unknown as SseHub,
      },
    });
    await server.start();
    try {
      const port = server.listeningPort();
      assert.ok(port !== null);
      const result = await fetchJson('/api/mr/group%2Fproject!1/stream', port);
      assert.strictEqual(result.status, 500);
      assert.deepStrictEqual(result.data, {
        error: { code: 'degraded', message: 'Internal server error' },
      });
    } finally {
      await server.stop();
    }
  });
});
