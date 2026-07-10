// @file: AuditRouter — GET /api/mr/:id/audit handler that reads audit trail from BoardProviderMock.
// @consumers: HttpServer
// @tasks: TSK-106

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/mr/:id/audit requests. */
const AUDIT_RE = /^\/api\/mr\/(.+)\/audit$/;

/**
 * @purpose Route handler for GET /api/mr/:id/audit — returns audit events for an MR.
 * @invariant Requires BoardProviderMock (not the abstract port) to access getAudit().
 */
export class AuditRouter {
  /** @purpose Board provider mock for audit data access. */
  protected _provider: BoardProviderMock;

  /**
   * @purpose Create an AuditRouter bound to a BoardProviderMock (for its getAudit method).
   * @param provider BoardProviderMock instance.
   */
  constructor(provider: BoardProviderMock) {
    this._provider = provider;
  }

  /**
   * @purpose Check if this request matches the audit route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return AUDIT_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the audit request — return audit events as JSON.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const match = url.pathname.match(AUDIT_RE);
      const mrId = decodeURIComponent(match?.[1] ?? '');

      const events: AuditEntry[] = this._provider.getAudit(mrId);
      sendJson(res, 200, { ok: true, events });
    } catch (cause) {
      sendError(res, cause);
    }
  }
}
