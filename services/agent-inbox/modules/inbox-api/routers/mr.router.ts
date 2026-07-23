// @file: MrRouter — POST /api/mr/:id/assign, POST /api/mr/:id/action, GET /api/mr/:id/report,
//   POST /api/mr/:id/copy-fix-task handlers.
// @consumers: HttpServer
// @tasks: TSK-106, TSK-145

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardProviderPort } from '../board-provider.port.ts';
import type { AssignBody, ActionBody, ActionChoice } from '../types.ts';
import { sendJson, sendError, parseBody } from '../http-helpers.ts';

/** @purpose Regex patterns for matching MR routes. */
const MR_ASSIGN_RE = /^\/api\/mr\/(.+)\/assign$/;
const MR_ACTION_RE = /^\/api\/mr\/(.+)\/action$/;
const MR_REPORT_RE = /^\/api\/mr\/(.+)\/report$/;
/** @purpose Route for SV-14: record one "Copy fix task" click, independent of executeAction's live-instance requirement (TSK-145). */
const MR_COPY_FIX_TASK_RE = /^\/api\/mr\/(.+)\/copy-fix-task$/;

/** @purpose Closed set of valid OperatorQuestion answers — EffectExecutor dispatches by this value. */
const VALID_ACTION_CHOICES: ReadonlySet<ActionChoice> = new Set([
  'post',
  'approve',
  'redispatch',
  'skip',
]);

/**
 * @purpose Route handlers for MR operations: assign, action, report.
 */
export class MrRouter {
  /** @purpose Board provider implementation. */
  protected _provider: BoardProviderPort;

  /**
   * @purpose Create an MrRouter bound to a board provider.
   * @param provider BoardProviderPort implementation (mock or real).
   */
  constructor(provider: BoardProviderPort) {
    this._provider = provider;
  }

  /**
   * @purpose Check if this request matches any MR route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    return (
      (req.method === 'POST' &&
        (MR_ASSIGN_RE.test(pathname) ||
          MR_ACTION_RE.test(pathname) ||
          MR_COPY_FIX_TASK_RE.test(pathname))) ||
      (req.method === 'GET' && MR_REPORT_RE.test(pathname))
    );
  }

  /**
   * @purpose Route the request to the correct handler based on path pattern.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (req.method === 'POST' && MR_ASSIGN_RE.test(pathname)) {
        await this._handleAssign(req, res, pathname);
      } else if (req.method === 'POST' && MR_ACTION_RE.test(pathname)) {
        await this._handleAction(req, res, pathname);
      } else if (req.method === 'GET' && MR_REPORT_RE.test(pathname)) {
        await this._handleReport(res, pathname);
      } else if (req.method === 'POST' && MR_COPY_FIX_TASK_RE.test(pathname)) {
        await this._handleCopyFixTask(res, pathname);
      }
    } catch (cause) {
      sendError(res, cause);
    }
  }

  /**
   * @purpose Extract MR ID from the URL path using the given regex.
   * @param pathname URL pathname.
   * @param re Regex with one capture group.
   * @returns Decoded MR ID.
   */
  protected _extractMrId(pathname: string, re: RegExp): string {
    const match = pathname.match(re);
    return decodeURIComponent(match?.[1] ?? '');
  }

  /**
   * @purpose Handle POST /api/mr/:id/assign — assign an MR to a role.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves when the response is sent.
   */
  protected async _handleAssign(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<void> {
    const mrId = this._extractMrId(pathname, MR_ASSIGN_RE);
    const body = await parseBody<AssignBody>(req);

    if (!body || !body.role) {
      sendJson(res, 400, { ok: false, error: 'CONFIG', detail: 'Missing required field: role' });
      return;
    }

    const result = this._provider.assignMr(mrId, body.role, body.rights);

    if (!result.ok) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: `MR not found: ${mrId}` });
      return;
    }

    sendJson(res, 200, result);
  }

  /**
   * @purpose Handle POST /api/mr/:id/action — execute an operator action on an MR.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves when the response is sent.
   */
  protected async _handleAction(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<void> {
    const mrId = this._extractMrId(pathname, MR_ACTION_RE);
    const body = await parseBody<ActionBody>(req);

    if (!body || !body.questionId || !body.choice) {
      sendJson(res, 400, {
        ok: false,
        error: 'CONFIG',
        detail: 'Missing required fields: questionId, choice',
      });
      return;
    }

    // #region START_VALIDATE_ACTION_CHOICE — invariant: EffectExecutor only dispatches the closed choice set
    if (!VALID_ACTION_CHOICES.has(body.choice)) {
      sendJson(res, 400, {
        ok: false,
        error: 'CONFIG',
        detail: `Invalid choice: ${body.choice} (expected one of post, approve, redispatch, skip)`,
      });
      return;
    }
    // #endregion END_VALIDATE_ACTION_CHOICE

    const result = this._provider.executeAction(mrId, {
      questionId: body.questionId,
      choice: body.choice,
      payload: body.payload,
    });

    if (!result.ok) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: `MR not found: ${mrId}` });
      return;
    }

    sendJson(res, 200, result);
  }

  /**
   * @purpose Handle GET /api/mr/:id/report — return detailed MR report.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves when the response is sent.
   */
  protected async _handleReport(res: ServerResponse, pathname: string): Promise<void> {
    const mrId = this._extractMrId(pathname, MR_REPORT_RE);
    const report = this._provider.getReport(mrId);

    if (!report) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: `MR not found: ${mrId}` });
      return;
    }

    sendJson(res, 200, { ok: true, ...report });
  }

  /**
   * @purpose Handle POST /api/mr/:id/copy-fix-task — record one "Copy fix task" click (SV-14, TSK-145).
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves when the response is sent.
   */
  protected async _handleCopyFixTask(res: ServerResponse, pathname: string): Promise<void> {
    const mrId = this._extractMrId(pathname, MR_COPY_FIX_TASK_RE);
    const result = await this._provider.recordFixTaskCopy(mrId);

    if (!result) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: `MR not found: ${mrId}` });
      return;
    }

    sendJson(res, 200, { ok: true, ...result });
  }
}
