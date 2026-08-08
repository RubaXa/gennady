// @file: StateRouter — GET /api/state?mr=<ref> handler returning batched MR state.
// @consumers: HttpServer
// @tasks: TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import { sendJson, sendDomainError, sendError } from '../http-helpers.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { MrCard } from '../dto/mr-card.type.ts';
import type { FeedWidget } from '../dto/feed-widget.type.ts';
import type { OperatorTurn } from '../../inbox-chat/operator-session.ts';
import type { BoardProjection } from '../projections/board-projection.ts';
import type { FeedProjection } from '../projections/feed-projection.ts';

/** @purpose Regex pattern for matching GET /api/state requests. */
const STATE_RE = /^\/api\/state$/;

/** @purpose Flat task DTO — one queue entry exposed by GET /api/state?mr=<ref>. */
export type TaskDto = {
  /** @purpose Per-MR monotonic task identifier (e.g. '#5') */
  taskId: string;
  /** @purpose Task type name */
  type: string;
  /** @purpose Lifecycle status (queued | running | done | failed) */
  status: string;
  /** @purpose Zero-based position among queued tasks */
  position: number;
  /** @purpose Dependencies that must complete before this task runs */
  dependsOn: string[];
  /** @purpose Who or what created this task */
  createdBy: string;
  /** @purpose ISO timestamp when the task was queued */
  createdAt: string;
};

/** @purpose Batched MR state response — card + queue + feed widgets for one MR. */
export type MrStateResponse = {
  /** @purpose Current MR card from board projection */
  card?: MrCard;
  /** @purpose Task queue entries for this MR */
  queue: TaskDto[];
  /** @purpose Recent feed widgets for this MR */
  widgets: FeedWidget[];
  /** @purpose Durable operator transcript, oldest first. */
  transcript: OperatorTurn[];
};

/**
 * @purpose Route handler for GET /api/state?mr=<ref> — batched endpoint returning
 *   the MR's card, queue, and recent widgets in one call for SSE reconnect reconciliation.
 * @invariant Accepts an optional BoardProjection and FeedProjection — returns empty
 *   slices when projections are absent (degraded mode).
 */
export class StateRouter {
  /** @purpose Task queue for per-MR state retrieval */
  protected _queue: TaskQueuePort;
  /** @purpose Board projection — when set, populates card in the batched response */
  protected _boardProjection: BoardProjection | null;
  /** @purpose Feed projection — when set, populates widgets in the batched response */
  protected _feedProjection: FeedProjection | null;

  /**
   * @purpose Create a StateRouter bound to a task queue with optional projections.
   * @param queue TaskQueuePort implementation.
   * @param [boardProjection] Optional BoardProjection for populating card.
   * @param [feedProjection] Optional FeedProjection for populating widgets.
   */
  constructor(
    queue: TaskQueuePort,
    boardProjection?: BoardProjection,
    feedProjection?: FeedProjection
  ) {
    this._queue = queue;
    this._boardProjection = boardProjection ?? null;
    this._feedProjection = feedProjection ?? null;
  }

  /**
   * @purpose Check if this request matches the state route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return STATE_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the state request — return batched MR state.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  handle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const mrRef = url.searchParams.get('mr') ?? '';

      if (!mrRef) {
        sendDomainError(res, 400, 'invalid_input', 'Missing required query parameter: mr');
        return;
      }

      const tasks = this._queue.state(mrRef);

      // #region START_COMPUTE_POSITIONS — assign zero-based positions to queued tasks
      let position = 0;
      const queue: TaskDto[] = tasks.map((inst) => {
        const pos = inst.status === 'queued' ? position++ : -1;
        return {
          taskId: inst.taskId,
          type: inst.type,
          status: inst.status,
          position: pos,
          dependsOn: inst.dependsOn.map((ref) =>
            ref.kind === 'type_name' ? ref.name : `${ref.kind}:${JSON.stringify(ref)}`
          ),
          createdBy: inst.createdBy,
          createdAt: inst.createdAt,
        };
      });
      // #endregion END_COMPUTE_POSITIONS

      // #region START_RESOLVE_PROJECTIONS — populate card and widgets when projections are wired
      let card: MrCard | undefined;
      let widgets: FeedWidget[] = [];
      let transcript: OperatorTurn[] = [];

      if (this._boardProjection) {
        const board = this._boardProjection.project();
        card = board.cards.find((c) => c.ref === mrRef);
      }

      if (this._feedProjection) {
        const feed = this._feedProjection.project(0, mrRef);
        widgets = feed.widgets;
        transcript = this._feedProjection.transcript(mrRef);
      }
      // #endregion END_RESOLVE_PROJECTIONS

      sendJson(res, 200, {
        card,
        queue,
        widgets,
        transcript,
      } satisfies MrStateResponse);
    } catch (cause) {
      logger.error('[StateRouter#handle] [state → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
