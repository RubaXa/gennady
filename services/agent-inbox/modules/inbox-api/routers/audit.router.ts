// @file: AuditRouter — GET /api/mr/:id/audit handler that reads audit trail from board provider.
// @consumers: HttpServer
// @tasks: TSK-106, TSK-117

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { BoardProviderPort } from '../board-provider.port.ts';
import { sendJson, sendError } from '../http-helpers.ts';

/** @purpose Regex pattern for matching GET /api/mr/:id/audit requests. */
const AUDIT_RE = /^\/api\/mr\/(.+)\/audit$/;

/**
 * @purpose Route handler for GET /api/mr/:id/audit — returns audit events for an MR.
 * Accepts BoardProviderPort; uses getAudit() if available, else empty array.
 */
export class AuditRouter {
  /** @purpose Board provider for audit data access. */
  protected _provider: BoardProviderPort;

  /**
   * @purpose Create an AuditRouter bound to a board provider.
   * @param provider Any BoardProviderPort implementation.
   */
  constructor(provider: BoardProviderPort) {
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

      // Try to call getAudit if the provider exposes it (BoardProviderMock)
      // Otherwise return empty audit trail
      const providerAny = this._provider as unknown as Record<string, unknown>;
      const events: AuditEntry[] =
        typeof providerAny.getAudit === 'function'
          ? (providerAny.getAudit as (mr: string) => AuditEntry[])(mrId)
          : [];

      sendJson(res, 200, { ok: true, events });
    } catch (cause) {
      sendError(res, cause);
    }
  }
}
