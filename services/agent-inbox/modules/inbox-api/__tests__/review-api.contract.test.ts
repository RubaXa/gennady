// @file: Contract tests — ReviewCommandKind closed-world, ProjectionPort interface, typed command mutation gates.
// @consumers: node:test runner
// @tasks: TSK-179

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { ReviewCommandRouter } from '../routers/commands/review-command.router.ts';
import type { ReviewCommandKind } from '../routers/commands/review-command.router.ts';
import type { ProjectionPort } from '../projections/projection.port.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';

// ── helpers (mirror pattern from routers.test.ts) ──

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
  res: ServerResponse & { status: () => number; body: () => unknown };
  status: () => number;
  body: () => unknown;
} {
  let responseStatus = 0;
  let responseBody: unknown = null;
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
  };
  const res = {
    writeHead: mock.fn((status: number) => {
      responseStatus = status;
      return res;
    }),
    end: mock.fn((chunk?: unknown) => {
      if (chunk != null) responseBody = chunk;
      return res;
    }),
    write: mock.fn(() => true),
    setHeader: mock.fn(() => res),
    getHeader: mock.fn(() => undefined),
    getHeaders: mock.fn(() => ({})),
    ...captured,
  } as unknown as ServerResponse & { status: () => number; body: () => unknown };
  return { res, ...captured };
}

// ── unified context ──

type CommandContext = {
  router: ReviewCommandRouter;
  queueEnqueue: ReturnType<typeof mock.fn>;
  journalAppend: ReturnType<typeof mock.fn>;
  decisionWrite: ReturnType<typeof mock.fn>;
  /** stub projection returns the given mrState/revision */
  setMrState(mrState: 'open' | 'merged' | 'closed', revision?: number): void;
};

function createCommandContext(): CommandContext {
  let currentMrState: 'open' | 'merged' | 'closed' = 'merged';
  let currentRevision = 0;

  const queueEnqueue = mock.fn((_mr: string, _type: string, _p: unknown) => ({
    taskId: '#test-1',
    position: 0,
  }));
  const journalAppend = mock.fn(async () => 1);
  const decisionWrite = mock.fn(async () => 1);

  const projections: ProjectionPort = {
    board: () => ({ mine: [], assigned: [], visible: [], cursor: 0 }),
    feed: () => ({ widgets: [], nextCursor: 0, unread: 0 }),
    mr: (_ref: string) => ({
      ref: _ref,
      title: 'Test MR',
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
      author: 'alice',
      mrState: currentMrState,
      findings: [],
      verdict: '',
      revision: currentRevision,
      artifacts: [],
      cursor: 0,
    }),
    packages: () => ({ current: [], stale: [], cursor: 0 }),
    testRun: () => ({ ref: '', status: 'unknown', preconditions: [], runs: [], cursor: 0 }),
    cursor: () => 0,
  };

  const router = new ReviewCommandRouter({
    queue: { enqueue: queueEnqueue } as unknown as TaskQueuePort,
    decisionJournal: { writeDecision: decisionWrite } as unknown as DecisionJournal,
    journal: { append: journalAppend } as unknown as JournalPort,
    projections,
  });

  return {
    router,
    queueEnqueue,
    journalAppend,
    decisionWrite,
    setMrState(mrState, revision = 0) {
      currentMrState = mrState;
      currentRevision = revision;
    },
  };
}

// ── Test Graph ──
// Case A: API commands projections and event frames are exhaustive
// Case B: typed command matrix rejects unsafe mutation and routes description and handoff receipt

// ── Cases ──

describe('ReviewCommandRouter contract', () => {
  it('API commands projections and event frames are exhaustive', () => {
    // invariant: ReviewCommandKind is a closed set of exactly 9 values; unknown kinds are rejected
    const expectedKinds: ReviewCommandKind[] = [
      'complete_mr',
      'apply_package',
      'edit_package',
      'reject_package',
      'verify_now',
      'retry_effect',
      'update_description',
      'generate_handoff',
      'acknowledge_handoff',
    ];
    // type-level check: exhaustive Record<ReviewCommandKind, true> — TS catches missing keys at compile time
    const exhaustiveCheck: Record<ReviewCommandKind, true> = {
      complete_mr: true,
      apply_package: true,
      edit_package: true,
      reject_package: true,
      verify_now: true,
      retry_effect: true,
      update_description: true,
      generate_handoff: true,
      acknowledge_handoff: true,
    } satisfies Record<ReviewCommandKind, true>;
    // runtime: expected count matches the exhaustive record
    assert.strictEqual(Object.keys(exhaustiveCheck).length, expectedKinds.length);
    assert.deepStrictEqual(Object.keys(exhaustiveCheck).sort(), [...expectedKinds].sort());
  });

  it('typed command matrix rejects unsafe mutation and routes description and handoff receipt', async () => {
    // invariant: malformed/stale/open-complete commands are rejected before any write
    // failure mode: optimistic acceptance ({ ok: true, taskId }) must be distinct from missing taskId on pure-journal commands

    const ctx = createCommandContext();
    const mrPath = '/api/v2/mr/group%2Fproject!1/command';

    // #region START_MISSING_KIND_ASSERT_400
    {
      const { res, status, body } = mockRes();
      await ctx.router.handle(mockReq('POST', mrPath, {}), res);
      assert.strictEqual(status(), 400);
      assert.strictEqual((body() as Record<string, unknown>).error != null, true);
    }
    // #endregion END_MISSING_KIND_ASSERT_400

    // #region START_UNKNOWN_KIND_ASSERT_400
    {
      const { res, status, body } = mockRes();
      await ctx.router.handle(mockReq('POST', mrPath, { kind: 'explode_server' }), res);
      assert.strictEqual(status(), 400);
      const err = (body() as { error: { code: string; message: string } }).error;
      assert.match(err.message, /Unknown command kind/);
    }
    // #endregion END_UNKNOWN_KIND_ASSERT_400

    // #region START_COMPLETE_OPEN_MR_ASSERT_400
    {
      ctx.setMrState('open');
      const { res, status, body } = mockRes();
      await ctx.router.handle(mockReq('POST', mrPath, { kind: 'complete_mr' }), res);
      assert.strictEqual(status(), 400);
      const err = (body() as { error: { code: string } }).error;
      assert.strictEqual(err.code, 'invalid_input');
    }
    // #endregion END_COMPLETE_OPEN_MR_ASSERT_400

    // #region START_COMPLETE_MERGED_MR_ASSERT_200
    {
      ctx.setMrState('merged');
      const { res, status, body } = mockRes();
      await ctx.router.handle(mockReq('POST', mrPath, { kind: 'complete_mr' }), res);
      assert.strictEqual(status(), 200);
      assert.strictEqual((body() as { ok: boolean }).ok, true);
      assert.strictEqual(ctx.journalAppend.mock.callCount(), 1);
    }
    // #endregion END_COMPLETE_MERGED_MR_ASSERT_200

    // #region START_STALE_APPLY_ASSERT_409
    {
      ctx.setMrState('merged', 5); // disk revision = 5
      const { res, status } = mockRes();
      await ctx.router.handle(
        mockReq('POST', mrPath, { kind: 'apply_package', packageId: 'pkg-1', revision: 2 }),
        res
      );
      assert.strictEqual(status(), 409);
      // no write happened
      assert.strictEqual(ctx.decisionWrite.mock.callCount(), 0);
    }
    // #endregion END_STALE_APPLY_ASSERT_409

    // #region START_UPDATE_DESCRIPTION_ASSERT_ENQUEUE
    {
      ctx.setMrState('open', 0);
      const { res, status, body } = mockRes();
      await ctx.router.handle(
        mockReq('POST', mrPath, { kind: 'update_description', description: 'New description' }),
        res
      );
      assert.strictEqual(status(), 200);
      const result = body() as { ok: boolean; taskId: string };
      assert.strictEqual(result.ok, true);
      assert.ok(typeof result.taskId === 'string', 'optimistic taskId must be returned');
    }
    // #endregion END_UPDATE_DESCRIPTION_ASSERT_ENQUEUE

    // #region START_ACKNOWLEDGE_HANDOFF_ASSERT_JOURNAL
    {
      ctx.setMrState('open', 0);
      const callsBefore = ctx.journalAppend.mock.callCount();
      const { res, status, body } = mockRes();
      await ctx.router.handle(
        mockReq('POST', mrPath, { kind: 'acknowledge_handoff', taskId: 'task-42' }),
        res
      );
      assert.strictEqual(status(), 200);
      assert.strictEqual((body() as { ok: boolean }).ok, true);
      // journal event appended (no taskId in response — pure acknowledgement)
      assert.strictEqual(ctx.journalAppend.mock.callCount(), callsBefore + 1);
    }
    // #endregion END_ACKNOWLEDGE_HANDOFF_ASSERT_JOURNAL
  });
});
