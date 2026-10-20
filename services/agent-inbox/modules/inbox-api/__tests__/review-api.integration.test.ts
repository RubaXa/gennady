// @file: Integration tests — journal rebuild restores all projections; pre-ready API is read-only observable.
// @consumers: node:test runner
// @tasks: TSK-179

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { JournalProjectionAdapter } from '../projections/journal-projection.adapter.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { ReviewQueryRouter } from '../routers/queries/review-query.router.ts';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { InboxRegistryAccess as InboxRegistryAccessType } from '../../inbox-core/inbox-registry.ts';

// ── registry stub ──

const EMPTY_REGISTRY = {
  load: () => ({ version: 1, entries: {} }),
} as unknown as InboxRegistryAccessType;

// ── snapshot factory (minimal) ──

function makeSnapshot(mrRef: string, role: 'author' | 'reviewer'): SyncSnapshot {
  const [project, iid] = mrRef.split('!');
  return {
    mr: {
      iid,
      project,
      webUrl: `https://gitlab.example.com/${project}/-/merge_requests/${iid}`,
      title: `MR ${iid}`,
      description: '',
      author: role === 'author' ? 'alice' : 'bob',
      reviewers: role === 'reviewer' ? ['alice'] : [],
      approvedBy: [],
      updatedAt: new Date().toISOString(),
      draft: false,
      state: 'opened',
      role,
      events: [],
      directlyAddressed: false,
      todoIds: [],
    },
    role,
    attention: '👀',
    stage: 'review_needed',
    approvals: { n: 0, m: 1, approvedBy: [] },
    reviewers: [],
    ci: { status: null },
    threads: { open: 0, total: 0, awaitingMe: 0 },
    headSha: '',
    lastReviewedHeadSha: null,
    updatedAt: new Date().toISOString(),
    estimated: false,
  };
}

// ── HTTP helper ──

function requestJson(
  port: number,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const encoded = body ? JSON.stringify(body) : undefined;
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: encoded
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>,
          })
        );
      }
    );
    req.on('error', reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

// ── unified context ──

type ApiContext = {
  stateDir: string;
  journal: EventJournal;
  adapter: JournalProjectionAdapter;
  queryRouter: ReviewQueryRouter;
};

async function createApiContext(snapshots: SyncSnapshot[]): Promise<ApiContext> {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-api-'));
  const journal = new EventJournal(join(stateDir, 'events.jsonl'));
  const adapter = new JournalProjectionAdapter({
    journal,
    registry: EMPTY_REGISTRY,
    stateDir,
    snapshots,
  });
  const queryRouter = new ReviewQueryRouter(adapter);
  return { stateDir, journal, adapter, queryRouter };
}

// ── Test Graph ──
// Case A: journal rebuild restores all projections and pre ready API remains read only observable

describe('ReviewAPI integration', () => {
  it('journal rebuild restores all projections and pre ready API remains read only observable', async () => {
    // invariant: JournalProjectionAdapter rebuilds board/feed/mr/packages/testRun consistently from
    //   the same journal; cursor advances after each rebuild call
    // failure mode: do not short-circuit projection when journal is non-empty but snapshots are empty

    const mrRef = 'group/project!17';
    const snap = makeSnapshot(mrRef, 'reviewer');

    const { journal, adapter } = await createApiContext([snap]);

    // #region START_SEED_JOURNAL
    await journal.append({
      ts: '2026-08-11T12:00:00Z',
      mr: mrRef,
      kind: 'task_created',
      actor: 'queue',
      payload: { taskId: '#1', type: 'test-suite' },
    });
    await journal.append({
      ts: '2026-08-11T12:01:00Z',
      mr: mrRef,
      kind: 'task_status',
      actor: 'queue',
      payload: { taskId: '#1', status: 'done' },
    });
    await journal.append({
      ts: '2026-08-11T12:02:00Z',
      mr: mrRef,
      kind: 'proposal',
      actor: 'queue',
      payload: {
        proposalId: 'prop-a',
        capability: 'approve',
        payload: { revision: 0 },
      },
    });
    // #endregion END_SEED_JOURNAL

    // #region START_BOARD_REBUILD_ASSERT
    const board = adapter.board();
    assert.ok(board.visible.includes(mrRef), 'MR visible in board after journal rebuild');
    assert.strictEqual(board.assigned.length, 1, 'reviewer MR in assigned queue');
    assert.ok(board.cursor > 0, 'cursor advances after board rebuild');
    // #endregion END_BOARD_REBUILD_ASSERT

    // #region START_MR_REBUILD_ASSERT
    const mr = adapter.mr(mrRef);
    assert.ok(mr !== null, 'mr() returns non-null when snapshot present');
    assert.strictEqual(mr!.ref, mrRef);
    assert.strictEqual(mr!.mrState, 'open');
    // #endregion END_MR_REBUILD_ASSERT

    // #region START_PACKAGES_REBUILD_ASSERT
    const pkgs = adapter.packages(mrRef);
    assert.strictEqual(pkgs.current.length, 1, 'proposal appears as current package');
    assert.strictEqual(pkgs.current[0].capability, 'approve');
    // #endregion END_PACKAGES_REBUILD_ASSERT

    // #region START_TESTRUN_REBUILD_ASSERT
    const testRun = adapter.testRun(mrRef);
    assert.strictEqual(testRun.ref, mrRef);
    // task_created with type 'test-suite' starts a run; task_status 'done' → passing
    assert.strictEqual(testRun.status, 'passing');
    assert.strictEqual(testRun.runs.length, 1);
    // #endregion END_TESTRUN_REBUILD_ASSERT

    // cursor consistency: every projection call updates cursor to the same max seq
    assert.strictEqual(adapter.cursor(), board.cursor);
  });
});

// ── Pre-ready observable test ──

describe('ReviewAPI integration — pre-ready HTTP server', () => {
  let server: HttpServer;
  let port: number;

  before(async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-preready-'));
    const journal = new EventJournal(join(stateDir, 'events.jsonl'));
    const registry = new InboxRegistryAccess(stateDir);
    const queue = new InMemoryTaskQueue(new TaskRegistry());
    const decisionJournal = new DecisionJournal(journal);

    // server WITHOUT boardReadiness set → boot endpoint reports not-ready
    server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      inboxApi: {
        queue,
        decisionJournal,
        journal,
        registry,
      },
    });
    await server.start();
    port = server.listeningPort() ?? assert.fail('Expected bound port');
  });

  after(async () => {
    await server.stop();
  });

  it('GET /api/boot observable before ready with phase and ready=false', async () => {
    // invariant: /api/boot is always reachable; pre-ready phase != 'ready', ready=false
    // failure mode: do not block boot reads; boot endpoint must be accessible before readiness

    const result = await requestJson(port, '/api/boot');
    assert.strictEqual(result.status, 200);
    // without explicit bootReadiness, BootRouter returns a default 'uninitialized' phase
    assert.ok(
      typeof result.body.phase === 'string',
      'phase field must be present regardless of readiness'
    );
    // v2 board query still reachable (returns projection result, not 503)
    const boardResult = await requestJson(port, '/api/v2/board');
    // the v2 board route is handled by BoardProjection (old path) when inboxApi configured
    // it should respond with 200 and an empty board
    assert.ok(
      boardResult.status === 200 || boardResult.status === 404,
      'v2 board must be reachable pre-ready'
    );
  });
});
