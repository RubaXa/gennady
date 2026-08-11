// @file: ReviewEventStream — per-MR SSE subscription with cursor-based replay and polling reconciliation.
// @consumers: HttpServer, review-event-stream.integration.test.ts
// @tasks: TSK-179

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { SseHub } from '../sse-hub.ts';
import { sendJson, sendDomainError, sendError } from '../http-helpers.ts';

/** @purpose SSE stream endpoint: GET /api/v2/mr/:ref/stream?cursor=<n> */
const STREAM_RE = /^\/api\/v2\/mr\/(.+)\/stream$/;

/** @purpose Polling reconciliation endpoint: GET /api/v2/mr/:ref/events?cursor=<n> */
const EVENTS_RE = /^\/api\/v2\/mr\/(.+)\/events$/;

/** @purpose Closed set of journal event kinds replayed as SSE frames on reconnect. */
const REPLAYABLE_KINDS = new Set([
  'task_created',
  'task_status',
  'artifact_produced',
  'widget_bump',
  'proposal',
  'decision',
  'chat_turn',
  'mutation',
]);

/** @purpose Reconnection wire payload — wraps each missed journal event as a delta frame. */
type ReconnectFrame = {
  type: 'reconnect_delta';
  seq: number;
  kind: string;
  mr: string;
  ts: string;
  payload?: Record<string, unknown>;
};

/**
 * @purpose Per-MR SSE endpoint with cursor-based replay and polling reconciliation fallback.
 * @invariant SSE disconnect never implies task failure — the task queue is independent.
 * @invariant Polling endpoint (/events) returns the same delta set as SSE replay, without duplicating outcomes.
 * @invariant New connections replay all replayable journal events since the supplied cursor before subscribing to live frames.
 */
export class ReviewEventStream {
  /** @purpose Event journal for cursor-based replay on reconnect. */
  protected _journal: EventJournal;
  /** @purpose Shared SSE hub for live per-MR subscriptions. */
  protected _hub: SseHub;

  /**
   * @purpose Create a ReviewEventStream backed by the event journal and SSE hub.
   * @param journal EventJournal for cursor-based replay.
   * @param hub SseHub for live per-MR subscriptions.
   */
  constructor(journal: EventJournal, hub: SseHub) {
    this._journal = journal;
    this._hub = hub;
  }

  /**
   * @purpose Check if this request matches the stream or events route.
   * @param req Incoming HTTP request.
   * @returns true when this stream handler should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return STREAM_RE.test(url.pathname) || EVENTS_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the stream or events request.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @sideEffect Opens an SSE connection for /stream; sends JSON for /events.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    try {
      if (STREAM_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(STREAM_RE)?.[1] ?? '');
        const cursor = this._parseCursor(url.searchParams.get('cursor'));
        this._handleSse(mrRef, cursor, req, res);
        return;
      }

      if (EVENTS_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(EVENTS_RE)?.[1] ?? '');
        const cursor = this._parseCursor(url.searchParams.get('cursor'));
        this._handlePolling(mrRef, cursor, res);
        return;
      }

      sendDomainError(res, 404, 'not_found', 'Route not found', 'path');
    } catch (cause) {
      logger.error('[ReviewEventStream#handle] [stream → failed]', { path: p, error: cause });
      sendError(res, cause);
    }
  }

  /**
   * @purpose Open a per-MR SSE connection — replay missed events since cursor, then subscribe to live frames.
   * @param mrRef Composite MR reference.
   * @param cursor Last-seen journal seq; 0 to receive all events.
   * @param req Incoming HTTP request (for close event).
   * @param res Server response kept open as text/event-stream.
   * @sideEffect Writes SSE headers, replay frames, and subscribes to hub; unsubscribes on connection close.
   */
  protected _handleSse(
    mrRef: string,
    cursor: number,
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');

    // #region START_REPLAY_MISSED_FRAMES — deliver all replayable events since cursor before subscribing to live
    const { entries, nextCursor } = this._journal.since(cursor);
    const missed = entries.filter((e) => e.mr === mrRef && REPLAYABLE_KINDS.has(e.kind));

    for (const entry of missed) {
      const frame: ReconnectFrame = {
        type: 'reconnect_delta',
        seq: entry.seq,
        kind: entry.kind,
        mr: entry.mr,
        ts: entry.ts,
        payload: entry.payload,
      };
      try {
        res.write(`event: reconnect_delta\ndata: ${JSON.stringify(frame)}\n\n`);
      } catch {
        /* client disconnected during replay — close event will unsubscribe */
        return;
      }
    }

    // Send the current cursor so the client knows where live frames begin
    try {
      res.write(
        `event: cursor_sync\ndata: ${JSON.stringify({ type: 'cursor_sync', cursor: nextCursor })}\n\n`
      );
    } catch {
      return;
    }
    // #endregion END_REPLAY_MISSED_FRAMES

    this._hub.subscribe(mrRef, res);
    req.on('close', () => {
      this._hub.unsubscribe(mrRef, res);
      logger.debug('[ReviewEventStream#_handleSse] [subscribed → closed]', { mrRef, cursor });
    });

    logger.debug('[ReviewEventStream#_handleSse] [idle → subscribed]', {
      mrRef,
      cursor,
      replayedCount: missed.length,
      nextCursor,
    });
  }

  /**
   * @purpose Handle polling reconciliation — return missed events as JSON delta without opening SSE.
   * @param mrRef Composite MR reference.
   * @param cursor Last-seen journal seq.
   * @param res Server response.
   * @sideEffect Writes a JSON response with the delta and next cursor; no SSE connection opened.
   */
  protected _handlePolling(mrRef: string, cursor: number, res: ServerResponse): void {
    const { entries, nextCursor } = this._journal.since(cursor);
    const delta = entries
      .filter((e) => e.mr === mrRef && REPLAYABLE_KINDS.has(e.kind))
      .map((e) => ({
        seq: e.seq,
        kind: e.kind,
        ts: e.ts,
        payload: e.payload,
      }));

    logger.debug('[ReviewEventStream#_handlePolling] [idle → served]', {
      mrRef,
      cursor,
      deltaCount: delta.length,
      nextCursor,
    });

    sendJson(res, 200, { ok: true, delta, nextCursor });
  }

  /**
   * @purpose Parse the cursor query parameter safely.
   * @param raw Raw cursor string from query params.
   * @returns Parsed non-negative integer; 0 on invalid input.
   */
  protected _parseCursor(raw: string | null): number {
    const n = parseInt(raw ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
}
