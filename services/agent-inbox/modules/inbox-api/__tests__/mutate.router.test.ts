// @file: Integration tests for MutateRouter — revision-CAS apply (D-99), broadcast fan-out of
//   mutation+refresh on success, and byte-unchanged review.json + refresh-to-all on conflict.
// @consumers: node:test runner
// @tasks: TSK-129, TSK-162, TSK-163

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { SessionPool } from '../../inbox-opencode/session-pool.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import type { MutationProposal } from '../../inbox-chat/types.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import type { SessionRouterPort } from '../../inbox-queue/session-router.ts';
import { Executor } from '../../inbox-queue/executor.ts';

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

/** @purpose HTTP GET helper for the feed side of the production mutation flow. */
function getJson(path: string, port: number): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: 'localhost', port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          data: JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as unknown,
        })
      );
    });
    req.on('error', reject);
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

type MutateRouterContext = {
  stateDir: string;
  server: HttpServer;
  port: number;
  queue: InMemoryTaskQueue;
};

/** @purpose One lifecycle context per case: a real HttpServer with the chat bridge wired over a real (temp) StateStore — opencode is a mock only because it's genuinely external and unused by /mutate. */
async function createMutateRouterContext(
  port: number,
  sessionRouter?: SessionRouterPort
): Promise<MutateRouterContext> {
  const stateDir = makeTestTmpDir('mutate-router-');
  const store = new StateStore(stateDir);
  const queue = new InMemoryTaskQueue(new TaskRegistry());
  const journal = new EventJournal(`${stateDir}/events.jsonl`);
  const pool = new SessionPool({ maxSessions: 5, opencode: new OpenCodeMock() });
  const server = new HttpServer({
    port,
    boardProvider: new BoardProviderMock(),
    chat: { pool, store, queue, journal, sessionRouter },
    inboxApi: {
      queue,
      decisionJournal: new DecisionJournal(journal),
      journal,
      registry: new InboxRegistryAccess(stateDir),
    },
  });
  await server.start();
  return {
    stateDir,
    server,
    port: server.listeningPort() ?? assert.fail('Expected kernel-assigned port'),
    queue,
  };
}

async function destroyMutateRouterContext(ctx: MutateRouterContext): Promise<void> {
  await ctx.server.stop();
  cleanupTestTmp(ctx.stateDir);
}

/** @purpose Seed `review.json` on disk with one finding at a given revision, matching MutationApplier's on-disk shape. */
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

describe('MutateRouter — POST /mutate', () => {
  let ctx: MutateRouterContext;

  beforeEach(async () => {
    ctx = await createMutateRouterContext(0);
  });

  afterEach(async () => {
    await destroyMutateRouterContext(ctx);
  });

  it('Успешный mutate — broadcast mutation+refresh', async () => {
    const mrRef = 'group/proj!20';
    await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const streamClient = await connectSseClient(ctx.port, mrRef);
    await streamClient.waitForNext(); // initial `retry:` hint

    const { status, data } = await postJson(
      `/api/mr/${encodeURIComponent(mrRef)}/mutate`,
      ctx.port,
      {
        proposal,
        revision: 0,
      }
    );

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; snapshot: string; revision: number };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.revision, 1);
    assert.ok(body.snapshot.length > 0);

    // #region START_ASSERT_BROADCAST_ORDER — invariant: mutation frame precedes refresh, both reach the subscriber (D-100)
    const mutationFrame = await streamClient.waitForNext();
    const refreshFrame = await streamClient.waitForNext();
    assert.match(mutationFrame, /^event: mutation\n/);
    assert.match(refreshFrame, /^event: refresh\n/);
    // #endregion END_ASSERT_BROADCAST_ORDER

    streamClient.destroy();
  });

  it('CAS-конфликт на mutate — 409 + refresh всем', async () => {
    const mrRef = 'group/proj!21';
    const reviewPath = await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const beforeBytes = await readFile(reviewPath, 'utf-8');
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const streamClient = await connectSseClient(ctx.port, mrRef);
    await streamClient.waitForNext(); // initial `retry:` hint

    const { status, data } = await postJson(
      `/api/mr/${encodeURIComponent(mrRef)}/mutate`,
      ctx.port,
      {
        proposal,
        revision: 5, // stale — on-disk revision is 0
      }
    );

    assert.strictEqual(status, 409);
    assert.deepStrictEqual(data, {
      error: { code: 'conflict', message: 'review.json revision 0 no longer matches 5' },
    });

    const afterBytes = await readFile(reviewPath, 'utf-8');
    assert.strictEqual(afterBytes, beforeBytes);

    const refreshFrame = await streamClient.waitForNext();
    assert.match(refreshFrame, /^event: refresh\n/);

    streamClient.destroy();
  });

  it('ошибка MutationApplier возвращается как structured HTTP error', async () => {
    const mrRef = 'group/proj!22';
    await seedReviewDocument(ctx.stateDir, mrRef, 0);

    const { status, data } = await postJson(
      `/api/mr/${encodeURIComponent(mrRef)}/mutate`,
      ctx.port,
      {
        proposal: {
          op: 'not-a-real-mutation',
          target: 'C-1',
          before: 'major',
          after: 'minor',
        },
        revision: 0,
      }
    );

    assert.strictEqual(status, 500);
    assert.deepStrictEqual(data, {
      error: { code: 'degraded', message: 'Internal server error' },
    });
  });

  it('HTTP mutate проходит через queue → MutationApplier → durable feed', async () => {
    const mrRef = 'group/proj!23';
    await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const result = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/mutate`, ctx.port, {
      proposal,
      revision: 0,
    });
    assert.equal(result.status, 200);
    assert.equal(ctx.queue.state(mrRef).at(-1)?.type, 'mutate_artifact');
    assert.equal(ctx.queue.state(mrRef).at(-1)?.status, 'done');

    const feed = await getJson(`/api/mr/${encodeURIComponent(mrRef)}/feed?cursor=0`, ctx.port);
    assert.equal(feed.status, 200);
    const widgets = (feed.data as { widgets: Array<{ type: string; payload: { effect: string } }> })
      .widgets;
    assert.ok(
      widgets.some(
        (widget) =>
          widget.type === 'action' && widget.payload.effect === 'artifact_updated_via_chat'
      )
    );
  });

  it('HTTP mutation has executor lifecycle and durable undo after server restart', async () => {
    const mrRef = 'group/proj!24';
    const reviewPath = await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const before = await readFile(reviewPath, 'utf-8');
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const applied = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/mutate`, ctx.port, {
      proposal,
      revision: 0,
    });
    assert.equal(applied.status, 200);
    const task = ctx.queue.state(mrRef).at(-1);
    assert.equal(task?.type, 'mutate_artifact');
    assert.equal(task?.status, 'done');

    // Recreate the entire HTTP/runtime bridge against the same state directory: undo must use
    // the mutation snapshot on disk, not in-memory router state from the first server.
    await ctx.server.stop();
    const restarted = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      chat: {
        pool: new SessionPool({ maxSessions: 5, opencode: new OpenCodeMock() }),
        store: new StateStore(ctx.stateDir),
        queue: new InMemoryTaskQueue(new TaskRegistry()),
        journal: new EventJournal(`${ctx.stateDir}/events.jsonl`),
      },
    });
    await restarted.start();
    try {
      const undone = await postJson(
        `/api/mr/${encodeURIComponent(mrRef)}/chat/undo`,
        restarted.listeningPort() ?? assert.fail('Expected restarted server port'),
        { snapshotId: (applied.data as { snapshot: string }).snapshot }
      );
      assert.equal(undone.status, 200);
      assert.equal(await readFile(reviewPath, 'utf-8'), before);
    } finally {
      await restarted.stop();
    }
  });

  it('HTTP mutate routes the running task to its producer before MutationApplier writes', async () => {
    await destroyMutateRouterContext(ctx);
    const mrRef = 'group/proj!25';
    const routingObservations: Array<{ taskType: string; status: string | undefined }> = [];
    let routedBeforeApply = false;
    const sessionRouter: SessionRouterPort = {
      async route(task): Promise<string> {
        routingObservations.push({
          taskType: task.type,
          status: ctx.queue.instance(mrRef, task.taskId)?.status,
        });
        const review = JSON.parse(
          await readFile(`${mrReportsDir(ctx.stateDir, mrRef)}/review.json`, 'utf-8')
        ) as { findings: Array<{ severity: string }> };
        routedBeforeApply = review.findings[0]?.severity === 'major';
        return 'producer-sid';
      },
    };
    ctx = await createMutateRouterContext(0, sessionRouter);
    await seedReviewDocument(ctx.stateDir, mrRef, 0);

    const result = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/mutate`, ctx.port, {
      proposal: { op: 'set-severity', target: 'C-1', before: 'major', after: 'minor' },
      revision: 0,
    });

    assert.equal(result.status, 200);
    assert.deepEqual(routingObservations, [{ taskType: 'mutate_artifact', status: 'running' }]);
    assert.equal(routedBeforeApply, true);
  });

  it('restores an incomplete durable mutation after restart', async () => {
    const mrRef = 'group/proj!26';
    const reviewPath = await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const journal = new EventJournal(`${ctx.stateDir}/crash-events.jsonl`);
    const registry = new TaskRegistry();
    const preCrashQueue = new InMemoryTaskQueue(registry);
    const preCrashExecutor = new Executor(journal, registry, preCrashQueue, mrRef);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };
    const { taskId } = await preCrashExecutor.enqueue('mutate_artifact', {
      anchor: { widgetId: 'review', elementId: proposal.target },
      intent: 'Apply set-severity to C-1',
      proposal,
      revision: 0,
      createdBy: 'operator',
    });
    assert.equal(preCrashQueue.instance(mrRef, taskId)?.status, 'queued');

    // A restart must not depend on the test-only `MutationRuntime#recover(mr)` seam. Recreate
    // the production HttpServer over the same durable journal and observe boot recovery before
    // the new HTTP listener becomes available.
    await ctx.server.stop();
    const recoveredQueue = new InMemoryTaskQueue(registry);
    const restarted = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      chat: {
        pool: new SessionPool({ maxSessions: 5, opencode: new OpenCodeMock() }),
        store: new StateStore(ctx.stateDir),
        queue: recoveredQueue,
        journal: new EventJournal(`${ctx.stateDir}/crash-events.jsonl`),
        taskRegistry: registry,
        sessionRouter: {
          async route(): Promise<string> {
            return 'producer-sid';
          },
        },
      },
    });
    try {
      await restarted.start();
      assert.equal(recoveredQueue.instance(mrRef, taskId)?.status, 'done');
      assert.match(await readFile(reviewPath, 'utf-8'), /"severity": "minor"/);
    } finally {
      await restarted.stop();
    }
  });
});
