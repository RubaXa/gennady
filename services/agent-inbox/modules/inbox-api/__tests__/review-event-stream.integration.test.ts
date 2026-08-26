// @file: Integration tests — ReviewEventStream polling fallback reconciles missed frames without duplicate outcome.
// @consumers: node:test runner
// @tasks: TSK-179

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { SseHub } from '../sse-hub.ts';
import { ReviewEventStream } from '../transport/review-event.stream.ts';

// ── HTTP helpers ──

function mockGetReq(url: string): IncomingMessage {
  const req = new Readable({ read() {} }) as IncomingMessage;
  req.method = 'GET';
  req.url = url;
  req.headers = { host: 'localhost' };
  process.nextTick(() => req.push(null));
  return req;
}

function mockRes(): {
  res: ServerResponse & { chunks: string[] };
  status: () => number;
  body: () => unknown;
} {
  let responseStatus = 0;
  let responseBody: unknown = null;
  const chunks: string[] = [];
  const res = {
    chunks,
    writeHead: mock.fn((s: number) => {
      responseStatus = s;
      return res;
    }),
    end: mock.fn((c?: unknown) => {
      if (c != null) responseBody = c;
      return res;
    }),
    write: mock.fn((c: unknown) => {
      if (typeof c === 'string') chunks.push(c);
      return true;
    }),
    setHeader: mock.fn(() => res),
    getHeader: mock.fn(() => undefined),
    getHeaders: mock.fn(() => ({})),
  } as unknown as ServerResponse & { chunks: string[] };
  return {
    res,
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
}

// ── unified context ──

type StreamContext = {
  stream: ReviewEventStream;
  journal: EventJournal;
};

function createStreamContext(): StreamContext {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-stream-'));
  const journal = new EventJournal(join(stateDir, 'events.jsonl'));
  const hub = new SseHub();
  const stream = new ReviewEventStream(journal, hub);
  return { stream, journal };
}

// ── Test Graph ──
// Case A: SSE reconnect and polling fallback reconcile missed frames without duplicate outcome

describe('ReviewEventStream integration', () => {
  it('SSE reconnect and polling fallback reconcile missed frames without duplicate outcome', async () => {
    // invariant: /events polling returns exactly the replayable events since cursor; no duplicates
    // failure mode: do not replay system or non-replayable events; cursor advances correctly

    const { stream, journal } = createStreamContext();
    const mrRef = 'group/project!3';

    // #region START_POPULATE_JOURNAL
    // seq 1: task_created (replayable)
    await journal.append({
      ts: '2026-08-11T10:00:00Z',
      mr: mrRef,
      kind: 'task_created',
      actor: 'queue',
      payload: { taskId: '#1', type: 'verify' },
    });
    // seq 2: proposal (replayable)
    await journal.append({
      ts: '2026-08-11T10:01:00Z',
      mr: mrRef,
      kind: 'proposal',
      actor: 'queue',
      payload: { proposalId: 'p-1', capability: 'approve' },
    });
    // seq 3: system (NOT replayable — must be filtered out)
    await journal.append({
      ts: '2026-08-11T10:02:00Z',
      mr: mrRef,
      kind: 'system',
      actor: 'operator',
      payload: { kind: 'mr_board_complete', mrRef },
    });
    // seq 4: decision (replayable, for a different MR — must be filtered by mrRef)
    await journal.append({
      ts: '2026-08-11T10:03:00Z',
      mr: 'other/project!9',
      kind: 'decision',
      actor: 'operator',
      payload: { proposalId: 'p-x', verdict: 'reject' },
    });
    // seq 5: widget_bump for mrRef (replayable)
    await journal.append({
      ts: '2026-08-11T10:04:00Z',
      mr: mrRef,
      kind: 'widget_bump',
      actor: 'queue',
      payload: { widgetId: 'w-1' },
    });
    // #endregion END_POPULATE_JOURNAL

    // #region START_POLLING_CURSOR_0_ASSERT
    // Polling from cursor=0 → all replayable events for mrRef: seq 1, 2, 5
    {
      const { res, body } = mockRes();
      const eventsPath = `/api/v2/mr/${encodeURIComponent(mrRef)}/events?cursor=0`;
      stream.handle(mockGetReq(eventsPath), res);
      const result = body() as {
        ok: boolean;
        delta: Array<{ seq: number; kind: string }>;
        nextCursor: number;
      };
      assert.strictEqual(result.ok, true);
      const seqs = result.delta.map((d) => d.seq);
      assert.deepStrictEqual(seqs, [1, 2, 5], 'seq 3 (system) and seq 4 (other MR) filtered');
      assert.strictEqual(result.nextCursor, 5);
    }
    // #endregion END_POLLING_CURSOR_0_ASSERT

    // #region START_POLLING_CURSOR_2_ASSERT_RECONNECT
    // Reconnect at cursor=2 → only seq 5 (seq 1,2 already seen; seq 3 filtered; seq 4 wrong MR)
    {
      const { res, body } = mockRes();
      const eventsPath = `/api/v2/mr/${encodeURIComponent(mrRef)}/events?cursor=2`;
      stream.handle(mockGetReq(eventsPath), res);
      const result = body() as {
        ok: boolean;
        delta: Array<{ seq: number; kind: string }>;
        nextCursor: number;
      };
      assert.strictEqual(result.ok, true);
      const seqs = result.delta.map((d) => d.seq);
      assert.deepStrictEqual(seqs, [5], 'only seq 5 missed since cursor=2');
      assert.strictEqual(result.nextCursor, 5);
    }
    // #endregion END_POLLING_CURSOR_2_ASSERT_RECONNECT

    // #region START_POLLING_CURSOR_5_ASSERT_EMPTY
    // Up-to-date cursor → empty delta (no duplicates)
    {
      const { res, body } = mockRes();
      const eventsPath = `/api/v2/mr/${encodeURIComponent(mrRef)}/events?cursor=5`;
      stream.handle(mockGetReq(eventsPath), res);
      const result = body() as { ok: boolean; delta: unknown[]; nextCursor: number };
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.delta.length, 0, 'no duplicate delivery at up-to-date cursor');
      assert.strictEqual(result.nextCursor, 5);
    }
    // #endregion END_POLLING_CURSOR_5_ASSERT_EMPTY
  });
});
