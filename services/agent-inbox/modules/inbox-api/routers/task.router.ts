// @file: TaskRouter — POST /api/task handler, enqueues tasks with explicit or computed dedup keys.
// @consumers: HttpServer
// @tasks: TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import { sendJson, sendDomainError, sendError, parseBody } from '../http-helpers.ts';

/** @purpose Regex pattern for matching legacy POST /api/task requests. */
const TASK_RE = /^\/api\/task$/;
/** @purpose Canonical MR-scoped task endpoint required by inbox-api spec §4. */
const MR_TASK_RE = /^\/api\/mr\/(.+)\/task$/;

/** @purpose Request body for POST /api/task. */
type TaskBody = {
  /** @purpose Task type name */
  type: string;
  /** @purpose Task parameters */
  params: Record<string, unknown>;
  /** @purpose Optional explicit dedup key — when absent, computed from type+canonical(params) */
  dedupKey?: string;
};

/**
 * @purpose Route handler for POST /api/task — enqueue with dedup (explicit key or computed
 *   from type + canonical params). Same dedupKey → same taskId response.
 */
export class TaskRouter {
  /** @purpose Task queue for enqueue operations */
  protected _queue: TaskQueuePort;

  /**
   * @purpose Create a TaskRouter bound to a task queue.
   * @param queue TaskQueuePort implementation.
   */
  constructor(queue: TaskQueuePort) {
    this._queue = queue;
  }

  /**
   * @purpose Check if this request matches the task route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'POST') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return TASK_RE.test(url.pathname) || MR_TASK_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the task request — enqueue and return taskId + position.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await parseBody<TaskBody>(req);

      if (!body || !body.type || !body.params) {
        sendDomainError(res, 400, 'invalid_input', 'Missing required fields: type, params');
        return;
      }

      // #region START_VALIDATE_PARAMS — params must be a plain object (not null, not array)
      if (typeof body.params !== 'object' || Array.isArray(body.params)) {
        sendDomainError(res, 400, 'invalid_input', 'params must be a plain object');
        return;
      }
      // #endregion END_VALIDATE_PARAMS

      // #region START_ENQUEUE_WITH_DEDUP — explicit dedupKey wins; otherwise queue computes from type+canonical(params)
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const canonicalMatch = url.pathname.match(MR_TASK_RE);
      const mrRef = canonicalMatch
        ? decodeURIComponent(canonicalMatch[1])
        : ((body.params.mr as string) ?? 'default');
      // Do not trust body.params.mr on the canonical resource: queue identity must always be the URL MR.
      const params = canonicalMatch ? { ...body.params, mr: mrRef } : body.params;
      const result = this._queue.enqueue(mrRef, body.type, params, body.dedupKey);

      logger.debug('[TaskRouter#handle] [idle → enqueued]', {
        mr: mrRef,
        type: body.type,
        taskId: result.taskId,
        dedupKey: body.dedupKey ?? 'computed',
      });

      sendJson(res, 200, { ok: true, ...result });
      // #endregion END_ENQUEUE_WITH_DEDUP
    } catch (cause) {
      logger.error('[TaskRouter#handle] [enqueue → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
