// @file: BoardRouter — GET /api/board handler, attention-grouped from BoardProjection (D-306)
//   with fallback to BoardProviderPort for backward compatibility.
// @consumers: HttpServer
// @tasks: TSK-106, TSK-158, TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { BoardProviderPort } from '../board-provider.port.ts';
import type { BoardProjection } from '../projections/board-projection.ts';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/board requests. */
const BOARD_PATH_RE = /^\/api\/board$/;

/**
 * @purpose Route handler for GET /api/board — returns attention-grouped board (D-306)
 *   when BoardProjection is wired, or legacy role-based board from BoardProviderPort.
 */
export class BoardRouter {
  /** @purpose Board provider implementation (legacy fallback). */
  protected _provider: BoardProviderPort;
  /** @purpose Board projection — when set, board is projected from sync+journal (D-306). */
  protected _projection: BoardProjection | null;

  /**
   * @purpose Create a BoardRouter bound to a board provider.
   * @param provider BoardProviderPort implementation (mock or real).
   */
  constructor(provider: BoardProviderPort) {
    this._provider = provider;
    this._projection = null;
  }

  /**
   * @purpose Wire the BoardProjection — activates the D-306 attention-grouped board view.
   * @param projection BoardProjection instance.
   */
  setProjection(projection: BoardProjection): void {
    this._projection = projection;
  }

  /**
   * @purpose Check if this request matches the board route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return BOARD_PATH_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the board request — return attention-grouped board when projection
   *   is wired, or legacy role-based board from provider.
   * @param _req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // #region START_BRANCH_PROJECTION_OR_LEGACY — use BoardProjection when wired (D-306); fallback to provider
      if (this._projection) {
        await this._projection.refreshFromTruth();
        const result = this._projection.project();
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      const board = this._provider.getBoard();
      sendJson(res, 200, { ok: true, ...board });
      // #endregion END_BRANCH_PROJECTION_OR_LEGACY
    } catch (cause) {
      logger.error('[BoardRouter#handle] [board → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
