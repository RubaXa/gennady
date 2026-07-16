// @file: ChatRouter — thin HTTP↔SSE bridge over inbox-chat's ChatSession (D-111, no business logic here).
// @consumers: HttpServer
// @tasks: TSK-129

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { SessionPool } from '../../inbox-opencode/session-pool.ts';
import type { StateStore } from '../../inbox-core/state-store.ts';
import { ChatSession } from '../../inbox-chat/chat-session.ts';
import { ContextAssembler } from '../../inbox-chat/context-assembler.ts';
import type { MutationApplier } from '../../inbox-chat/mutation-applier.ts';
import type { ContextChip } from '../../inbox-chat/types.ts';
import { sendJson, parseBody } from '../http-helpers.ts';
import { SseHub } from '../sse-hub.ts';

/** @purpose Regex patterns for matching chat routes — `mrRef` capture allows the `project!iid` composite key (slash + `!`). */
const CHAT_ASK_RE = /^\/api\/mr\/(.+)\/chat$/;
const CHAT_STREAM_RE = /^\/api\/mr\/(.+)\/chat\/stream$/;
const CHAT_UNDO_RE = /^\/api\/mr\/(.+)\/chat\/undo$/;
const CHAT_STOP_RE = /^\/api\/mr\/(.+)\/chat\/stop$/;

/** @purpose Request body for `POST /api/mr/:id/chat`. */
type ChatAskBody = {
  /** @purpose Operator's question text */
  text: string;
  /** @purpose Context chips attached to this turn */
  chips?: ContextChip[];
};

/** @purpose Request body for `POST /api/mr/:id/chat/undo`. */
type ChatUndoBody = {
  /** @purpose Snapshot id returned by a prior successful `POST /mutate` */
  snapshotId: string;
};

/** @purpose Dependencies `ChatRouter` needs to build a per-MR `ChatSession` and bridge its events over SSE. */
export type ChatRouterDeps = {
  /** @purpose Shared opencode session pool backing every `ChatSession` (SV-11, D-102) */
  pool: SessionPool;
  /** @purpose Shared state store — session/report/transcript root (NFC-05) */
  store: StateStore;
  /** @purpose Shared mutation applier — `undo()` delegate for `POST /chat/undo` (TSK-127) */
  mutationApplier: MutationApplier;
  /** @purpose Shared SSE broadcast hub — one channel per MR serving both chat and mutation events (D-100, D-110) */
  sseHub: SseHub;
};

/**
 * @purpose Route handlers for the review chat: async ask, SSE subscribe, undo, stop.
 * @invariant Delegates every decision (turn serialization, mutation CAS, streaming truncation) to
 * `inbox-chat` — this router only shapes HTTP/SSE around it (D-111).
 */
export class ChatRouter {
  /** @purpose Injected dependencies. */
  protected _deps: ChatRouterDeps;
  /** @purpose One `ChatSession` per MR, created lazily on first ask/stream (D-100, D-102). */
  protected _sessions: Map<string, ChatSession> = new Map();

  /**
   * @purpose Create a ChatRouter bound to the shared session pool, state store, mutation applier,
   * and SSE hub.
   * @param deps Shared dependencies threaded from `HttpServer`.
   */
  constructor(deps: ChatRouterDeps) {
    this._deps = deps;
  }

  /**
   * @purpose Check if this request matches any chat route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    const pathname = this._pathname(req);
    if (req.method === 'GET') return CHAT_STREAM_RE.test(pathname);
    return (
      req.method === 'POST' &&
      (CHAT_ASK_RE.test(pathname) || CHAT_UNDO_RE.test(pathname) || CHAT_STOP_RE.test(pathname))
    );
  }

  /**
   * @purpose Route the request to the correct handler based on path pattern.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent (POST) or the SSE connection is opened (GET).
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = this._pathname(req);

    if (req.method === 'GET' && CHAT_STREAM_RE.test(pathname)) {
      this._handleStream(res, pathname);
      return;
    }

    if (req.method === 'POST' && CHAT_ASK_RE.test(pathname)) {
      await this._handleAsk(req, res, pathname);
      return;
    }

    if (req.method === 'POST' && CHAT_UNDO_RE.test(pathname)) {
      await this._handleUndo(req, res, pathname);
      return;
    }

    if (req.method === 'POST' && CHAT_STOP_RE.test(pathname)) {
      await this._handleStop(res, pathname);
      return;
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
   * @param re Regex with one capture group.
   * @returns Decoded MR reference.
   */
  protected _extractMrRef(pathname: string, re: RegExp): string {
    const match = pathname.match(re);
    return decodeURIComponent(match?.[1] ?? '');
  }

  /**
   * @purpose Resolve (or lazily create) the `ChatSession` for an MR, wiring its token/mutation
   * events into the shared `SseHub` exactly once per session (D-100).
   * @param mrRef MR reference the session is bound to.
   * @returns Existing or newly created session for `mrRef`.
   */
  protected _resolveSession(mrRef: string): ChatSession {
    const existing = this._sessions.get(mrRef);
    if (existing) return existing;

    const session = new ChatSession({
      pool: this._deps.pool,
      store: this._deps.store,
      assembler: new ContextAssembler({ store: this._deps.store }),
      mrRef,
    });
    session.onToken((token) => this._deps.sseHub.broadcast(mrRef, { type: 'token', token }));
    session.onMutationProposed((mutation) =>
      this._deps.sseHub.broadcast(mrRef, { type: 'mutation', mutation })
    );
    this._sessions.set(mrRef, session);
    return session;
  }

  /**
   * @purpose Handle `POST /api/mr/:id/chat` — 202 immediately (D-89), 409 on in-flight turn (D-104).
   * @invariant Turn resolution reaches clients only through the SSE stream, never this response.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves once the immediate 202/400/409 response has been sent.
   */
  protected async _handleAsk(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<void> {
    const mrRef = this._extractMrRef(pathname, CHAT_ASK_RE);
    const body = await parseBody<ChatAskBody>(req);

    if (!body || !body.text) {
      sendJson(res, 400, { ok: false, error: 'CONFIG', detail: 'Missing required field: text' });
      return;
    }

    const session = this._resolveSession(mrRef);

    // #region START_REJECT_IN_FLIGHT_TURN — invariant: checked synchronously before ask() runs so no second turn can start on the same session (D-104)
    if (session.busy) {
      sendJson(res, 409, {
        ok: false,
        error: 'TURN_IN_FLIGHT',
        detail: `Turn already in flight on sid=${session.sid ?? '(not yet created)'}`,
      });
      return;
    }
    // #endregion END_REJECT_IN_FLIGHT_TURN

    sendJson(res, 202, { ok: true });
    void this._runTurn(session, mrRef, body.text, body.chips ?? []);
  }

  /**
   * @param session Session to run the turn on.
   * @param mrRef MR reference the session belongs to — SSE broadcast target.
   * @param text Operator's question text.
   * @param chips Context chips attached to the turn.
   * @returns Promise that resolves once the turn's outcome has been broadcast.
   * @sideEffect SSE: broadcasts `turn_done` on success or `error` on `SESSION_ERROR`.
   */
  protected async _runTurn(
    session: ChatSession,
    mrRef: string,
    text: string,
    chips: ContextChip[]
  ): Promise<void> {
    const result = await session.ask({ text, chips });

    // #region START_BROADCAST_TURN_OUTCOME — invariant: TURN_IN_FLIGHT cannot reach here (rejected synchronously in _handleAsk)
    if (result.ok) {
      this._deps.sseHub.broadcast(mrRef, { type: 'turn_done', turn: result.turn });
    } else {
      logger.warn('[ChatRouter#_runTurn] [asking → error]', { mrRef, error: result.error });
      this._deps.sseHub.broadcast(mrRef, {
        type: 'error',
        error: result.error,
        detail: result.detail,
      });
    }
    // #endregion END_BROADCAST_TURN_OUTCOME
  }

  /**
   * @purpose Handle `GET /api/mr/:id/chat/stream` — subscribe this connection to the MR's SSE
   * channel; unsubscribe on disconnect (never throws on subsequent broadcasts, see `SseHub`).
   * @param res Server response kept open as `text/event-stream`.
   * @param pathname URL pathname.
   */
  protected _handleStream(res: ServerResponse, pathname: string): void {
    const mrRef = this._extractMrRef(pathname, CHAT_STREAM_RE);
    this._deps.sseHub.subscribe(mrRef, res);
    res.req?.on('close', () => this._deps.sseHub.unsubscribe(mrRef, res));
  }

  /**
   * @purpose Handle `POST /api/mr/:id/chat/undo` — delegates to `MutationApplier#undo`, then
   * broadcasts `refresh` to every subscriber of the MR.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves once the response is sent.
   */
  protected async _handleUndo(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<void> {
    const mrRef = this._extractMrRef(pathname, CHAT_UNDO_RE);
    const body = await parseBody<ChatUndoBody>(req);

    if (!body || !body.snapshotId) {
      sendJson(res, 400, {
        ok: false,
        error: 'CONFIG',
        detail: 'Missing required field: snapshotId',
      });
      return;
    }

    const result = await this._deps.mutationApplier.undo({ mrRef, snapshotId: body.snapshotId });

    if (!result.ok) {
      sendJson(res, 404, { ok: false, error: result.error, detail: 'Snapshot not found' });
      return;
    }

    this._deps.sseHub.broadcast(mrRef, { type: 'refresh' });
    sendJson(res, 200, { ok: true });
  }

  /**
   * @purpose Handle `POST /api/mr/:id/chat/stop` — delegates to `ChatSession#stop`; ack is
   * synchronous, well under the 200ms budget (CH-11) since `stop()` only flips a flag.
   * @param res Server response.
   * @param pathname URL pathname.
   * @returns Promise that resolves once the response is sent.
   */
  protected async _handleStop(res: ServerResponse, pathname: string): Promise<void> {
    const mrRef = this._extractMrRef(pathname, CHAT_STOP_RE);
    const session = this._resolveSession(mrRef);
    await session.stop();
    sendJson(res, 200, { ok: true });
  }
}
