// @file: MutateRouter — thin HTTP bridge over inbox-chat's MutationApplier: revision-CAS apply, broadcasts mutation+refresh to every SSE subscriber of the MR (D-99, D-100, D-111).
// @consumers: HttpServer
// @tasks: TSK-129, TSK-162, TSK-163

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { MutationApplier } from '../../inbox-chat/mutation-applier.ts';
import type { MutationFlow } from '../../inbox-chat/mutation-flow.ts';
import type { MutationRuntime } from '../../inbox-chat/mutation-runtime.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { MutationProposal } from '../../inbox-chat/types.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import { sendDomainError, sendError, sendJson, parseBody } from '../http-helpers.ts';
import { SseHub } from '../sse-hub.ts';

/** @purpose Regex pattern for matching the mutate route — `mrRef` capture allows the `project!iid` composite key (slash + `!`). */
const MUTATE_RE = /^\/api\/mr\/(.+)\/mutate$/;

/** @purpose Request body for `POST /api/mr/:id/mutate`. */
type MutateBody = {
  /** @purpose Assistant-proposed mutation to apply */
  proposal: MutationProposal;
  /** @purpose `review.json` revision the proposal was computed against — CAS input (D-99) */
  revision: number;
};

/** @purpose Dependencies `MutateRouter` needs to apply a mutation and fan it out over SSE. */
export type MutateRouterDeps = {
  /** @purpose Shared mutation applier — CAS apply delegate (TSK-127) */
  mutationApplier: MutationApplier;
  /** @purpose Queue proposal seam; production mutation is always visible before it is applied. */
  mutationFlow?: MutationFlow;
  /** @purpose Executor-backed consumer of a submitted mutation proposal. */
  mutationRuntime?: MutationRuntime;
  /** @purpose Queue owning the proposal lifecycle; paired with `mutationFlow`. */
  queue?: TaskQueuePort;
  /** @purpose Shared SSE broadcast hub — one channel per MR serving both chat and mutation events (D-100, D-110) */
  sseHub: SseHub;
  /** @purpose Durable feed source receiving each successfully applied mutation. */
  journal?: JournalPort;
};

/**
 * @purpose Route handler for `POST /api/mr/:id/mutate` — revision-CAS apply with a broadcast to
 * every client viewing the MR, on both success and conflict (D-99, D-100).
 * @invariant Delegates the CAS decision and the `review.json` write entirely to `MutationApplier`
 * — this router only shapes HTTP/SSE around it (D-111).
 */
export class MutateRouter {
  /** @purpose Injected dependencies. */
  protected _deps: MutateRouterDeps;

  /**
   * @purpose Create a MutateRouter bound to the shared mutation applier and SSE hub.
   * @param deps Shared dependencies threaded from `HttpServer`.
   */
  constructor(deps: MutateRouterDeps) {
    this._deps = deps;
  }

  /**
   * @purpose Check if this request matches the mutate route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    return req.method === 'POST' && MUTATE_RE.test(this._pathname(req));
  }

  /**
   * @purpose Handle `POST /api/mr/:id/mutate`.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const mrRef = this._extractMrRef(this._pathname(req));
      const body = await parseBody<MutateBody>(req);

      if (!body || !body.proposal || typeof body.revision !== 'number') {
        sendDomainError(res, 400, 'invalid_input', 'Missing required fields: proposal, revision');
        return;
      }

      // HTTP submits only a MutationFlow proposal. The runtime's Executor advances it, routes it
      // to the producer session and owns every task status transition before the CAS writer runs.
      const consumed = this._deps.mutationRuntime
        ? await this._deps.mutationRuntime.submit(mrRef, body.proposal, body.revision)
        : {
            taskId: this._deps.mutationFlow?.propose(
              mrRef,
              { widgetId: 'review', elementId: body.proposal.target },
              `Apply ${body.proposal.op} to ${body.proposal.target}`
            ),
            result: await this._deps.mutationApplier.apply(body.proposal, {
              mrRef,
              revision: body.revision,
            }),
          };
      const { taskId, result } = consumed;

      // #region START_BRANCH_ON_CAS_OUTCOME — invariant: STALE_REVISION leaves review.json untouched, yet every subscriber still gets `refresh` so a stale client re-syncs (D-99)
      if (!result.ok) {
        this._deps.sseHub.broadcast(mrRef, { type: 'refresh' });
        sendDomainError(res, 409, 'conflict', result.detail);
        return;
      }

      // Matching CAS increments revision once; the server-issued snapshot is carried in SSE for safe undo.
      const nextRevision = body.revision + 1;
      await this._deps.journal?.append({
        ts: new Date().toISOString(),
        mr: mrRef,
        kind: 'mutation',
        actor: 'chat',
        payload: {
          effect: 'artifact_updated_via_chat',
          proposal: body.proposal,
          snapshot: result.snapshot,
          revision: nextRevision,
          ...(taskId ? { taskId } : {}),
        },
      });
      this._deps.sseHub.broadcast(mrRef, {
        type: 'mutation',
        mutation: body.proposal,
        snapshotId: result.snapshot,
      });
      this._deps.sseHub.broadcast(mrRef, { type: 'refresh' });
      sendJson(res, 200, { ok: true, snapshot: result.snapshot, revision: nextRevision });
      // #endregion END_BRANCH_ON_CAS_OUTCOME
    } catch (cause) {
      logger.error('[MutateRouter#handle] [applying → failed]', { cause });
      if (!res.headersSent) sendError(res, cause);
    }
  }

  /**
   * @param req Incoming HTTP request.
   * @returns URL pathname, decoded relative to the request's own host header.
   */
  protected _pathname(req: IncomingMessage): string {
    return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
  }

  /**
   * @param pathname URL pathname.
   * @returns Decoded MR reference.
   */
  protected _extractMrRef(pathname: string): string {
    const match = pathname.match(MUTATE_RE);
    return decodeURIComponent(match?.[1] ?? '');
  }
}
