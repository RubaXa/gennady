// @file: RoleRouter — POST /api/role/:name/activate handler (SV-07 real-mode activation gap fix).
// @consumers: HttpServer
// @tasks: TSK-113

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardProviderPort } from '../board-provider.port.ts';
import { sendDomainError, sendJson, sendError, parseBody } from '../http-helpers.ts';

/** @purpose Regex pattern for matching POST /api/role/:name/activate requests. */
const ROLE_ACTIVATE_RE = /^\/api\/role\/([^/]+)\/activate$/;

/** @purpose Request body for POST /api/role/:name/activate. */
type ActivateBody = { active: boolean };

/**
 * @purpose Route handler for POST /api/role/:name/activate — toggle a role's
 *   activation state, the only real-mode entry point for auto-assignment (SV-07).
 */
export class RoleRouter {
  /** @purpose Board provider implementation. */
  protected _provider: BoardProviderPort;

  /**
   * @purpose Create a RoleRouter bound to a board provider.
   * @param provider BoardProviderPort implementation (mock or real).
   */
  constructor(provider: BoardProviderPort) {
    this._provider = provider;
  }

  /**
   * @purpose Check if this request matches the role-activate route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'POST') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return ROLE_ACTIVATE_RE.test(url.pathname);
  }

  /**
   * @purpose Handle POST /api/role/:name/activate — set the role's active flag.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const match = url.pathname.match(ROLE_ACTIVATE_RE);
    const roleName = decodeURIComponent(match?.[1] ?? '');

    try {
      const body = await parseBody<ActivateBody>(req);
      if (!body || typeof body.active !== 'boolean') {
        sendDomainError(res, 400, 'invalid_input', 'Missing required field: active', 'active');
        return;
      }

      const result = this._provider.setRoleActive(roleName, body.active);
      if (!result.ok) {
        sendDomainError(res, 404, 'not_found', `Role not found: ${roleName}`, 'role');
        return;
      }

      sendJson(res, 200, result);
    } catch (cause) {
      sendError(res, cause);
    }
  }
}
