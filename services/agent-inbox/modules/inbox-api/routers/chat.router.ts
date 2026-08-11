// @file: ChatRouter — thin HTTP↔SSE bridge over inbox-chat's ChatSession (D-111, no business logic here).
// @consumers: HttpServer
// @tasks: TSK-129, TSK-162, TSK-163, TSK-175

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { logger } from '#logger';
import type { SessionPool } from '../../inbox-opencode/session-pool.ts';
import type { StateStore } from '../../inbox-core/state-store.ts';
import { ChatSession } from '../../inbox-chat/chat-session.ts';
import { ContextAssembler } from '../../inbox-chat/context-assembler.ts';
import type { MutationApplier } from '../../inbox-chat/mutation-applier.ts';
import type { MutationRuntime } from '../../inbox-chat/mutation-runtime.ts';
import type { Anchor } from '../../inbox-chat/anchor.ts';
import { OperatorSession } from '../../inbox-chat/operator-session.ts';
import type { ContextChip } from '../../inbox-chat/types.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { SessionRouterPort } from '../../inbox-queue/session-router.ts';
import { sendDomainError, sendError, sendJson, parseBody } from '../http-helpers.ts';
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
  /** @purpose Optional durable artifact anchor attached to the operator question. */
  anchor?: Anchor;
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
  /** @purpose Durable executor-backed mutation consumer for undo. */
  mutationRuntime?: MutationRuntime;
  /** @purpose Shared SSE broadcast hub — one channel per MR serving both chat and mutation events (D-100, D-110) */
  sseHub: SseHub;
  /** @purpose Durable chat history backing; absent only for legacy isolated router tests. */
  journal?: JournalPort;
  /** @purpose Live queue/session-routing seam for every operator question. */
  queue?: TaskQueuePort;
  /** @purpose Routes `chat_question` through the shared operator session policy. */
  sessionRouter?: SessionRouterPort;
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
  /** @purpose One journal-backed history projection per MR. */
  protected _operatorSessions: Map<string, OperatorSession> = new Map();

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
    try {
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
      }
    } catch (cause) {
      logger.error('[ChatRouter#handle] [routing → failed]', { cause });
      if (!res.headersSent) sendError(res, cause);
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
   * @purpose Resolve the durable history projection for an MR when production journal wiring exists.
   * @param mrRef Canonical MR reference.
   * @returns The MR history projection, or undefined for isolated legacy router wiring.
   */
  protected _resolveOperatorSession(mrRef: string): OperatorSession | undefined {
    if (!this._deps.journal) return undefined;
    const existing = this._operatorSessions.get(mrRef);
    if (existing) return existing;
    const session = new OperatorSession({
      journal: this._deps.journal,
      // Restart owns the durable digest; the actual reissued answer must still travel through the
      // shared HTTP chat session so its tokens and lifecycle remain observable to SSE clients.
      answer: async (text) => {
        const result = await this._resolveSession(mrRef).ask({ text, chips: [] });
        if (!result.ok) throw new Error(result.detail);
        return result.turn.answer;
      },
    });
    this._operatorSessions.set(mrRef, session);
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
      sendDomainError(res, 400, 'invalid_input', 'Missing required field: text', 'text');
      return;
    }

    const session = this._resolveSession(mrRef);

    // #region START_REJECT_IN_FLIGHT_TURN — invariant: checked synchronously before ask() runs so no second turn can start on the same session (D-104)
    if (session.busy) {
      sendDomainError(
        res,
        409,
        'conflict',
        `Turn already in flight on sid=${session.sid ?? '(not yet created)'}`
      );
      return;
    }
    // #endregion END_REJECT_IN_FLIGHT_TURN

    const operatorSession = this._resolveOperatorSession(mrRef);
    let operatorTurnId: string | undefined;
    if (operatorSession) {
      operatorTurnId = `t-${randomUUID()}`;
      const operatorTurn = {
        turnId: operatorTurnId,
        role: 'operator',
        text: body.text,
        ...(body.anchor ? { anchor: body.anchor } : {}),
      } as const;
      await operatorSession.record(mrRef, operatorTurn);
      operatorSession.begin(mrRef, operatorTurn);
    }
    if (this._deps.queue && this._deps.sessionRouter) {
      const queued = this._deps.queue.enqueue(mrRef, 'chat_question', {
        text: body.text,
        anchor: body.anchor,
      });
      const task = this._deps.queue.instance(mrRef, queued.taskId);
      if (task) session.adoptSid(await this._deps.sessionRouter.route(task, mrRef), task.taskId);
    }

    sendJson(res, 202, { ok: true });
    void this._runTurn(
      session,
      mrRef,
      body.text,
      body.chips ?? [],
      operatorSession,
      body.anchor,
      operatorTurnId
    );
  }

  /**
   * @param session Session to run the turn on.
   * @param mrRef MR reference the session belongs to — SSE broadcast target.
   * @param text Operator's question text.
   * @param chips Context chips attached to the turn.
   * @param [operatorSession] Durable journal projection for the MR.
   * @param [anchor] Artifact context persisted with the durable turns.
   * @param [operatorTurnId] Durable operator turn eligible for overflow restart.
   * @returns Promise that resolves once the turn's outcome has been broadcast.
   * @sideEffect SSE: broadcasts `turn_done` on success or `error` on `SESSION_ERROR`.
   */
  protected async _runTurn(
    session: ChatSession,
    mrRef: string,
    text: string,
    chips: ContextChip[],
    operatorSession?: OperatorSession,
    anchor?: Anchor,
    operatorTurnId?: string
  ): Promise<void> {
    let result: Awaited<ReturnType<ChatSession['ask']>>;
    try {
      result = await session.ask({ text, chips });
    } catch (cause) {
      logger.error('[ChatRouter#_runTurn] [asking → failed]', { mrRef, cause });
      this._deps.sseHub.broadcast(mrRef, {
        type: 'error',
        error: 'SESSION_ERROR',
        detail: 'Chat turn failed',
      });
      return;
    }

    // #region START_BROADCAST_TURN_OUTCOME — invariant: TURN_IN_FLIGHT cannot reach here (rejected synchronously in _handleAsk)
    if (result.ok) {
      if (operatorSession) {
        await operatorSession.record(mrRef, {
          turnId: `t-${randomUUID()}`,
          role: 'assistant',
          text: result.turn.answer,
          ...(anchor ? { anchor } : {}),
        });
      }
      if (operatorSession && operatorTurnId) operatorSession.settle(operatorTurnId);
      this._deps.sseHub.broadcast(mrRef, { type: 'turn_done', turn: result.turn });
    } else {
      // OpenCode context exhaustion is recoverable: reissue exactly once from the durable
      // operator digest. The failed original result is deliberately never broadcast, preventing
      // a duplicate assistant answer on SSE after the recovered turn settles.
      if (
        operatorSession &&
        operatorTurnId &&
        result.error === 'SESSION_ERROR' &&
        /(?:context|token).*(?:overflow|limit)|overflow/i.test(result.detail)
      ) {
        try {
          const restarted = await operatorSession.restartWithDigest(mrRef, operatorTurnId);
          operatorSession.settle(operatorTurnId);
          this._deps.sseHub.broadcast(mrRef, {
            type: 'turn_done',
            turn: {
              id: restarted.turnId,
              ts: new Date().toISOString(),
              question: text,
              chips,
              answer: restarted.text,
              reviewRevision: 0,
            },
          });
          return;
        } catch (cause) {
          logger.error('[ChatRouter#_runTurn] [overflow → restart_failed]', { mrRef, cause });
        }
      }
      if (operatorSession && operatorTurnId) operatorSession.settle(operatorTurnId);
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
      sendDomainError(
        res,
        400,
        'invalid_input',
        'Missing required field: snapshotId',
        'snapshotId'
      );
      return;
    }

    const result = this._deps.mutationRuntime
      ? await this._deps.mutationRuntime.undo(mrRef, body.snapshotId)
      : await this._deps.mutationApplier.undo({ mrRef, snapshotId: body.snapshotId });

    if (!result.ok) {
      sendDomainError(res, 404, 'not_found', 'Snapshot not found', 'snapshotId');
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
