// @file: MutateRouter — thin HTTP bridge over inbox-chat's MutationApplier: revision-CAS apply, broadcasts mutation+refresh to every SSE subscriber of the MR (D-99, D-100, D-111).
// @consumers: HttpServer
// @tasks: TSK-129

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MutationApplier } from '../../inbox-chat/mutation-applier.ts';
import type { MutationProposal } from '../../inbox-chat/types.ts';
import { sendJson, parseBody } from '../http-helpers.ts';
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
  /** @purpose Shared SSE broadcast hub — one channel per MR serving both chat and mutation events (D-100, D-110) */
  sseHub: SseHub;
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
    const mrRef = this._extractMrRef(this._pathname(req));
    const body = await parseBody<MutateBody>(req);

    if (!body || !body.proposal || typeof body.revision !== 'number') {
      sendJson(res, 400, {
        ok: false,
        error: 'CONFIG',
        detail: 'Missing required fields: proposal, revision',
      });
      return;
    }

    const result = await this._deps.mutationApplier.apply(body.proposal, {
      mrRef,
      revision: body.revision,
    });

    // #region START_BRANCH_ON_CAS_OUTCOME — invariant: STALE_REVISION leaves review.json untouched, yet every subscriber still gets `refresh` so a stale client re-syncs (D-99)
    if (!result.ok) {
      this._deps.sseHub.broadcast(mrRef, { type: 'refresh' });
      sendJson(res, 409, { ok: false, error: result.error, detail: result.detail });
      return;
    }

    // apply() increments the on-disk revision by exactly one on a matching CAS (MutationApplier
    // invariant) — the client's next mutate call can reuse this value without an extra disk read.
    const nextRevision = body.revision + 1;
    this._deps.sseHub.broadcast(mrRef, { type: 'mutation', mutation: body.proposal });
    this._deps.sseHub.broadcast(mrRef, { type: 'refresh' });
    sendJson(res, 200, { ok: true, snapshot: result.snapshot, revision: nextRevision });
    // #endregion END_BRANCH_ON_CAS_OUTCOME
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
