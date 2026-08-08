// @file: StreamRouter — SSE /api/mr/:ref/stream: per-MR SSE endpoint.
//   board_hint is broadcast to ALL active MR channels via SseHub (no global stream per spec §3).
// @consumers: HttpServer
// @tasks: TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import { SseHub } from '../sse-hub.ts';
import { sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/mr/:ref/stream requests — per-MR SSE endpoint. */
const STREAM_MR_RE = /^\/api\/mr\/(.+)\/stream$/;

/**
 * @purpose Route handler for GET /api/mr/:ref/stream — per-MR SSE connections; board_hint fans to all MR channels via SseHub (spec §3: no global stream).
 * @invariant No global /api/stream endpoint — board_hint broadcasts through SseHub to every per-MR subscriber.
 */
export class StreamRouter {
  /** @purpose Shared SSE hub for per-MR subscriptions and board_hint broadcast */
  protected _hub: SseHub;

  /**
   * @purpose Create a StreamRouter bound to a shared SSE hub.
   * @param hub SseHub instance shared across routers.
   */
  constructor(hub: SseHub) {
    this._hub = hub;
  }

  /**
   * @purpose Check if this request matches a stream route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return STREAM_MR_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the stream request — subscribe to per-MR SSE channel via SseHub.
   * @param req Incoming HTTP request.
   * @param res Server response kept open as text/event-stream.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const match = url.pathname.match(STREAM_MR_RE);
      const mrRef = decodeURIComponent(match?.[1] ?? '');

      this._hub.subscribe(mrRef, res);
      req.on('close', () => this._hub.unsubscribe(mrRef, res));
      logger.debug('[StreamRouter#handle] [idle → subscribed]', { mrRef });
    } catch (cause) {
      logger.error('[StreamRouter#handle] [stream → failed]', { error: cause });
      sendError(res, cause);
    }
  }

  /**
   * @purpose Issue a board_hint to EVERY subscriber across all MR channels via SseHub —
   *   triggers dashboard board re-fetch for every connected client.
   * @sideEffect Writes board_hint SSE frame to every active per-MR connection.
   */
  sendBoardHint(): void {
    logger.debug('[StreamRouter#sendBoardHint] [idle → broadcasting]');
    this._hub.broadcastAll({ type: 'board_hint', timestamp: new Date().toISOString() });
  }
}
