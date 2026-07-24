// @file: DiagnosticsRouter — GET /api/diagnostics: recent server-log tail so the dashboard's 🐞
//   button can carry the SERVER's own flow diagnostics (lens/synthesis/effect failures live
//   server-side), not only the browser's ring buffer.
// @consumers: HttpServer, DebugLogButton (via api-client)
// @tasks: TSK-debug-log

import type { IncomingMessage, ServerResponse } from 'node:http';
import { snapshotServerLog } from '#logger';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/diagnostics requests. */
const DIAGNOSTICS_RE = /^\/api\/diagnostics$/;

/** @purpose Default number of most-recent server-log lines returned when `?limit` is absent. */
const DEFAULT_LIMIT = 400;

/**
 * @purpose Route handler for GET /api/diagnostics — returns the recent server-log tail as lines.
 */
export class DiagnosticsRouter {
  /**
   * @purpose Check if this request matches the diagnostics route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return DIAGNOSTICS_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the diagnostics request — return recent server-log lines as JSON.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const rawLimit = Number(url.searchParams.get('limit'));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;
      const lines = snapshotServerLog(limit);
      sendJson(res, 200, { ok: true, lines, count: lines.length });
    } catch (cause) {
      sendError(res, cause);
    }
  }
}
