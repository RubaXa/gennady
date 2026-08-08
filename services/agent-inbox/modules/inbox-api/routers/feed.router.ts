// @file: FeedRouter — GET /api/feed?cursor=0 handler, cursor-based pagination via FeedProjection.
// @consumers: HttpServer
// @tasks: TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import { sendJson, sendError } from '../http-helpers.ts';
import type { FeedProjection } from '../projections/feed-projection.ts';

/** @purpose Regex pattern for matching legacy GET /api/feed requests. */
const FEED_RE = /^\/api\/feed$/;
/** @purpose Canonical MR-scoped feed endpoint required by inbox-api spec §4. */
const MR_FEED_RE = /^\/api\/mr\/(.+)\/feed$/;

/** @purpose Default cursor when none provided — starts from the beginning. */
const DEFAULT_CURSOR = 0;

/**
 * @purpose Route handler for GET /api/feed?cursor=0&mr=<ref> — projects events into
 *   paginated feed widgets, advancing the read-cursor on the consuming MR.
 */
export class FeedRouter {
  /** @purpose Feed projection — maps journal entries to feed widgets */
  protected _projection: FeedProjection;

  /**
   * @purpose Create a FeedRouter backed by a feed projection.
   * @param projection FeedProjection instance.
   */
  constructor(projection: FeedProjection) {
    this._projection = projection;
  }

  /**
   * @purpose Check if this request matches the feed route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return FEED_RE.test(url.pathname) || MR_FEED_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the feed request — return paginated widgets with next cursor.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const cursor = Number(url.searchParams.get('cursor')) || DEFAULT_CURSOR;
      const canonicalMatch = url.pathname.match(MR_FEED_RE);
      // URL scope is authoritative for the canonical endpoint.  The query parameter remains only
      // for the legacy route so callers cannot project a different MR than the resource they ask for.
      const mrKey = canonicalMatch
        ? decodeURIComponent(canonicalMatch[1])
        : (url.searchParams.get('mr') ?? undefined);

      const result = this._projection.project(cursor, mrKey);

      sendJson(res, 200, { ok: true, ...result });
    } catch (cause) {
      logger.error('[FeedRouter#handle] [feed → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
