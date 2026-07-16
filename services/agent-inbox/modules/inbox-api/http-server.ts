// @file: HttpServer — node:http server on port 4174 with routing, CORS, static files, graceful shutdown.
// @consumers: gennady inbox serve (CLI), e2e tests
// @tasks: TSK-106, TSK-133

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { logger } from '#logger';
import { BoardRouter } from './routers/board.router.ts';
import { MrRouter } from './routers/mr.router.ts';
import { ArtifactRouter } from './routers/artifact.router.ts';
import { AuditRouter } from './routers/audit.router.ts';
import { ChatRouter } from './routers/chat.router.ts';
import { MutateRouter } from './routers/mutate.router.ts';
import { SseHub } from './sse-hub.ts';
import { setDryRunBroadcaster } from '../inbox-core/dry-run.ts';
import { StaticFiles } from './static-files.ts';
import { setCorsHeaders, handlePreflight, sendJson } from './http-helpers.ts';
import type { BoardProviderPort } from './board-provider.port.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import { MutationApplier } from '../inbox-chat/mutation-applier.ts';

/** @purpose Dependencies backing the Review Chat bridge (`ChatRouter`/`MutateRouter`) — optional so
 * callers without a live `SessionPool` (e.g. isolated unit tests) can omit it (TSK-133). */
export type HttpServerChatConfig = {
  /** @purpose Shared opencode session pool backing every `ChatSession` (SV-11, D-102) */
  pool: SessionPool;
  /** @purpose Shared state store — session/report/transcript root (NFC-05) */
  store: StateStore;
};

/** @purpose Configuration for the HttpServer. */
export type HttpServerConfig = {
  /** @purpose Port to listen on (default: 4174). */
  port: number;
  /** @purpose Board provider implementation (mock or real). */
  boardProvider: BoardProviderPort;
  /** @purpose Path to static files directory (default: dist/inbox-serve). */
  staticDir?: string;
  /** @purpose When present, wires the Review Chat bridge (`/chat`, `/chat/stream`, `/chat/undo`,
   * `/chat/stop`, `/mutate`) live — absent means those routes 404 (TSK-133). */
  chat?: HttpServerChatConfig;
};

/**
 * @purpose Lightweight node:http server for the agent-inbox serve-mode.
 * @invariant Zero external dependencies — only node:http, node:fs.
 * @invariant Graceful shutdown: stop accepting new connections, drain active requests before closing.
 */
export class HttpServer {
  /** @purpose Server configuration. */
  protected _config: HttpServerConfig;
  /** @purpose Underlying node:http Server instance. */
  protected _server: Server | null = null;
  /** @purpose Router for board API endpoints. */
  protected _boardRouter: BoardRouter;
  /** @purpose Router for MR API endpoints. */
  protected _mrRouter: MrRouter;
  /** @purpose Router for artifact browser API endpoints. */
  protected _artifactRouter: ArtifactRouter;
  /** @purpose Router for audit API endpoints. */
  protected _auditRouter: AuditRouter;
  /** @purpose Router for Review Chat endpoints — undefined unless `config.chat` is supplied (TSK-133). */
  protected _chatRouter: ChatRouter | undefined;
  /** @purpose Router for the mutate endpoint — undefined unless `config.chat` is supplied (TSK-133). */
  protected _mutateRouter: MutateRouter | undefined;
  /** @purpose Static file server. */
  protected _staticFiles: StaticFiles;
  /** @purpose Track active sockets for graceful shutdown. */
  protected _sockets: Set<unknown> = new Set();

  /**
   * @purpose Create an HttpServer with routing wired to the given board provider.
   * @param config Server configuration — port, boardProvider, optional staticDir.
   */
  constructor(config: HttpServerConfig) {
    this._config = config;
    this._boardRouter = new BoardRouter(config.boardProvider);
    this._mrRouter = new MrRouter(config.boardProvider);
    this._artifactRouter = new ArtifactRouter(config.boardProvider);
    this._auditRouter = new AuditRouter(config.boardProvider);
    this._staticFiles = new StaticFiles(config.staticDir);

    // #region START_WIRE_CHAT — invariant: ChatRouter and MutateRouter share one SseHub/MutationApplier so both event families broadcast over the same per-MR channel (D-100, D-110, TSK-133)
    if (config.chat) {
      const sseHub = new SseHub();
      const mutationApplier = new MutationApplier({ store: config.chat.store });
      this._chatRouter = new ChatRouter({
        pool: config.chat.pool,
        store: config.chat.store,
        mutationApplier,
        sseHub,
      });
      this._mutateRouter = new MutateRouter({ mutationApplier, sseHub });

      // #region START_WIRE_DRY_RUN_BROADCAST — TSK-131: suppressed external writes (EffectExecutor
      // VCS mutations, RightsEscalator DMs) fan out over this server's SSE hub to every connected
      // dashboard, which console.logs them — the browser-observable proof no real write happened
      setDryRunBroadcaster((entry) => sseHub.broadcastAll({ type: 'dryrun', ...entry }));
      // #endregion END_WIRE_DRY_RUN_BROADCAST
    }
    // #endregion END_WIRE_CHAT
  }

  /**
   * @purpose Start the server — begin listening on the configured port.
   * @returns Promise that resolves when the server is listening.
   * @sideEffect Binds to port, registers request handler.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._server) {
        reject(new Error('[HttpServer#start] Server is already running'));
        return;
      }

      this._server = createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this._server.on('connection', (socket) => {
        this._sockets.add(socket);
        socket.on('close', () => this._sockets.delete(socket));
      });

      this._server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(
            new Error(`[HttpServer#start] Port ${this._config.port} is already in use`, {
              cause: err,
            })
          );
        } else {
          reject(err);
        }
      });

      this._server.listen(this._config.port, () => {
        logger.info('[HttpServer#start] [starting → listening]', {
          port: this._config.port,
        });
        resolve();
      });
    });
  }

  /**
   * @purpose Stop the server gracefully — stop accepting new connections, wait for active ones to complete.
   * @returns Promise that resolves when the server is fully stopped.
   * @sideEffect Closes the server socket, resolves when all active connections are done.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._server) {
        resolve();
        return;
      }

      logger.info('[HttpServer#stop] [listening → stopping]', { port: this._config.port });

      const shutdownTimeout = setTimeout(() => {
        for (const socket of this._sockets) {
          (socket as { destroy(): void }).destroy();
        }
        this._sockets.clear();
      }, 5000);

      // Detach the dry-run broadcaster bound to this server's SSE hub so a later server (or test)
      // does not fan writes out over a closed hub (TSK-131).
      setDryRunBroadcaster(null);

      this._server.close(() => {
        clearTimeout(shutdownTimeout);
        logger.info('[HttpServer#stop] [stopping → stopped]');
        this._server = null;
        resolve();
      });
    });
  }

  /**
   * @purpose Main request handler — routes to the appropriate handler or serves static files.
   * @param req Incoming HTTP request.
   * @param res Server response.
   */
  protected _handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Set CORS headers on all responses
    setCorsHeaders(res, req.headers.origin);

    // Handle CORS preflight
    if (handlePreflight(req, res)) return;

    // Route to API handlers
    if (this._boardRouter.matches(req)) {
      void this._boardRouter.handle(req, res);
      return;
    }

    if (this._mrRouter.matches(req)) {
      void this._mrRouter.handle(req, res);
      return;
    }

    if (this._artifactRouter.matches(req)) {
      void this._artifactRouter.handle(req, res);
      return;
    }

    if (this._auditRouter.matches(req)) {
      this._auditRouter.handle(req, res);
      return;
    }

    if (this._chatRouter?.matches(req)) {
      void this._chatRouter.handle(req, res);
      return;
    }

    if (this._mutateRouter?.matches(req)) {
      void this._mutateRouter.handle(req, res);
      return;
    }

    // Check if it looks like an API path but didn't match any route
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND', detail: 'Unknown API route' });
      return;
    }

    // SPA fallback — serve static files or index.html
    this._staticFiles.serve(req, res);
  }
}
