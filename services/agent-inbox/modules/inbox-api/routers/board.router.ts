// @file: BoardRouter — GET /api/board handler that aggregates board state from BoardProviderPort.
// @consumers: HttpServer
// @tasks: TSK-106

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardProviderPort } from '../board-provider.port.ts';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/board requests. */
const BOARD_PATH_RE = /^\/api\/board$/;

/**
 * @purpose Route handler for GET /api/board — returns full board state (roles[] + unassigned[]).
 */
export class BoardRouter {
  /** @purpose Board provider implementation. */
  protected _provider: BoardProviderPort;

  /**
   * @purpose Create a BoardRouter bound to a board provider.
   * @param provider BoardProviderPort implementation (mock or real).
   */
  constructor(provider: BoardProviderPort) {
    this._provider = provider;
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
   * @purpose Handle the board request — return board state as JSON.
   * @param _req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const board = this._provider.getBoard();
      sendJson(res, 200, { ok: true, ...board });
    } catch (cause) {
      sendError(res, cause);
    }
  }
}
