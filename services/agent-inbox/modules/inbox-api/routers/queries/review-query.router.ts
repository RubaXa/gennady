// @file: ReviewQueryRouter — read-only projection queries; serves board/feed/MR/packages/tests views.
// @consumers: HttpServer, review-api.contract.test.ts
// @tasks: TSK-179

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { ProjectionPort } from '../../projections/projection.port.ts';
import { sendJson, sendDomainError, sendError } from '../../http-helpers.ts';

/** @purpose Route patterns for the v2 query surface — all GET, no mutations. */
const BOARD_RE = /^\/api\/v2\/board$/;
const MR_RE = /^\/api\/v2\/mr\/([^/]+)$/;
const FEED_RE = /^\/api\/v2\/mr\/(.+)\/feed$/;
const PACKAGES_RE = /^\/api\/v2\/mr\/(.+)\/packages$/;
const TESTS_RE = /^\/api\/v2\/mr\/(.+)\/tests$/;

/**
 * @purpose Route handler serving all v2 read-only projection queries — no domain mutations.
 * @invariant All routes delegate exclusively to ProjectionPort; no queue or journal writes.
 */
export class ReviewQueryRouter {
  /** @purpose Projection port providing all read-only views. */
  protected _projections: ProjectionPort;

  /**
   * @purpose Create a ReviewQueryRouter bound to a projection port.
   * @param projections ProjectionPort implementation (journal adapter or test adapter).
   */
  constructor(projections: ProjectionPort) {
    this._projections = projections;
  }

  /**
   * @purpose Check if this request matches any v2 query route.
   * @param req Incoming HTTP request.
   * @returns true when this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;
    return (
      BOARD_RE.test(p) ||
      MR_RE.test(p) ||
      FEED_RE.test(p) ||
      PACKAGES_RE.test(p) ||
      TESTS_RE.test(p)
    );
  }

  /**
   * @purpose Dispatch the query to the correct projection handler.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const p = url.pathname;

    try {
      // #region START_ROUTE_QUERY — match route patterns in specificity order (longest first)
      if (FEED_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(FEED_RE)?.[1] ?? '');
        const cursor = parseInt(url.searchParams.get('cursor') ?? '0', 10);
        const result = this._projections.feed(mrRef, Number.isFinite(cursor) ? cursor : 0);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (PACKAGES_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(PACKAGES_RE)?.[1] ?? '');
        const result = this._projections.packages(mrRef);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (TESTS_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(TESTS_RE)?.[1] ?? '');
        const result = this._projections.testRun(mrRef);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (MR_RE.test(p)) {
        const mrRef = decodeURIComponent(p.match(MR_RE)?.[1] ?? '');
        const result = this._projections.mr(mrRef);
        if (!result) {
          sendDomainError(res, 404, 'not_found', `MR not found: ${mrRef}`, 'mr');
          return;
        }
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (BOARD_RE.test(p)) {
        const result = this._projections.board();
        sendJson(res, 200, { ok: true, ...result });
        return;
      }
      // #endregion END_ROUTE_QUERY

      sendDomainError(res, 404, 'not_found', 'Route not found', 'path');
    } catch (cause) {
      logger.error('[ReviewQueryRouter#handle] [query → failed]', { path: p, error: cause });
      sendError(res, cause);
    }
  }
}
