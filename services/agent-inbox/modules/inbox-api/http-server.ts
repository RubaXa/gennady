// @file: HttpServer — node:http server on port 4174 with routing, CORS, static files, graceful shutdown.
// @consumers: gennady inbox serve (CLI), e2e tests
// @tasks: TSK-106, TSK-133, TSK-157, TSK-158, TSK-162, TSK-163, TSK-170, TSK-179

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { logger } from '#logger';
import { BoardRouter } from './routers/board.router.ts';
import { MrRouter } from './routers/mr.router.ts';
import { DiagnosticsRouter } from './routers/diagnostics.router.ts';
import { ArtifactRouter } from './routers/artifact.router.ts';
import { AuditRouter } from './routers/audit.router.ts';
import { ChatRouter } from './routers/chat.router.ts';
import { MutateRouter } from './routers/mutate.router.ts';
import { BootRouter } from './routers/boot.router.ts';
import { StateRouter } from './routers/state.router.ts';
import { FeedRouter } from './routers/feed.router.ts';
import { TaskRouter } from './routers/task.router.ts';
import { DecisionRouter } from './routers/decision.router.ts';
import { StreamRouter } from './routers/stream.router.ts';
import { SseHub } from './sse-hub.ts';
import { BoardProjection } from './projections/board-projection.ts';
import { FeedProjection } from './projections/feed-projection.ts';
import { setDryRunBroadcaster } from '../inbox-core/dry-run.ts';
import { StaticFiles } from './static-files.ts';
import { setCorsHeaders, handlePreflight, sendDomainError } from './http-helpers.ts';
import type { BoardProviderPort } from './board-provider.port.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import { MutationApplier } from '../inbox-chat/mutation-applier.ts';
import { MutationFlow } from '../inbox-chat/mutation-flow.ts';
import { MutationRuntime } from '../inbox-chat/mutation-runtime.ts';
import type { TaskQueuePort } from '../inbox-queue/task-queue.ts';
import type { DecisionJournal } from '../inbox-core/decision-journal.ts';
import type { EventJournal } from '../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../inbox-core/inbox-registry.ts';
import type { SyncSnapshot } from '../inbox-vcs/sync.ts';
import type { BootReadiness } from '../inbox-core/boot-readiness.ts';
import type { SessionRouterPort } from '../inbox-queue/session-router.ts';
import type { TaskRegistry } from '../inbox-queue/task-registry.ts';

/**
 * @purpose Dependencies backing the Review Chat bridge (`ChatRouter`/`MutateRouter`) — optional so
 * callers without a live `SessionPool` (e.g. isolated unit tests) can omit it (TSK-133).
 */
export type HttpServerChatConfig = {
  /** @purpose Shared opencode session pool backing every `ChatSession` (SV-11, D-102) */
  pool: SessionPool;
  /** @purpose Shared state store — session/report/transcript root (NFC-05) */
  store: StateStore;
  /** @purpose Shared queue so operator questions and mutations enter the durable runtime. */
  queue?: TaskQueuePort;
  /** @purpose Shared MR journal used by the durable operator history projection. */
  journal?: EventJournal;
  /** @purpose Session policy router used before each operator prompt. */
  sessionRouter?: SessionRouterPort;
  /** @purpose Immutable registry shared by queue Executor and mutation consumer. */
  taskRegistry?: TaskRegistry;
};

/** @purpose Configuration for the HttpServer. */
export type HttpServerConfig = {
  /** @purpose Port to listen on (default: 4174). */
  port: number;
  /** @purpose Board provider implementation (mock or real). */
  boardProvider: BoardProviderPort;
  /** @purpose Path to static files directory (default: dist/inbox-serve). */
  staticDir?: string;
  /**
   * @purpose When present, wires the Review Chat bridge (`/chat`, `/chat/stream`, `/chat/undo`,
   * `/chat/stop`, `/mutate`) live — absent means those routes 404 (TSK-133).
   */
  chat?: HttpServerChatConfig;
  /**
   * @purpose When present, wires the inbox-api v2 routers (boot/state/feed/task/decision/stream)
   *   with live projections — absent means those routes 404 (TSK-162).
   */
  inboxApi?: HttpServerInboxApiConfig;
  /** @purpose Shared bootstrap readiness state exposed at GET /api/boot. */
  bootReadiness?: BootReadiness;
};

/** @purpose Dependencies backing the inbox-api v2 routers (TSK-162). */
export type HttpServerInboxApiConfig = {
  /** @purpose Task queue for enqueue and state queries */
  queue: TaskQueuePort;
  /** @purpose Decision journal for recording verdicts */
  decisionJournal: DecisionJournal;
  /** @purpose Event journal for feed/board projections */
  journal: EventJournal;
  /** @purpose Registry access for lastReadAt and MR lookup */
  registry: InboxRegistryAccess;
  /** @purpose Initial sync snapshots for board projection — empty array is valid */
  snapshots?: SyncSnapshot[];
  /**
   * @purpose Authoritative VCS snapshot loader invoked before each board projection in live serve mode.
   * @returns Fresh VCS snapshots for the next projection.
   */
  loadSnapshots?: () => Promise<SyncSnapshot[]>;
  /** @purpose Optional SSE hub seam for HTTP-level failure-contract tests and external lifecycle integration. */
  sseHub?: SseHub;
  /**
   * @purpose Creates a durable journal.
   * @param mr Canonical MR ref.
   * @returns MR-scoped journal.
   */
  resolveDecisionJournal?: (mr: string) => DecisionJournal;
  /**
   * @purpose Persists graduation.
   * @param mr Canonical MR ref.
   * @param journal Durable journal.
   * @returns Completion.
   */
  onDecision?: (mr: string, journal: DecisionJournal) => Promise<void>;
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
  /** @purpose Router for the server-log diagnostics endpoint (🐞 button). */
  protected _diagnosticsRouter: DiagnosticsRouter;
  /** @purpose Router for artifact browser API endpoints. */
  protected _artifactRouter: ArtifactRouter;
  /** @purpose Router for audit API endpoints. */
  protected _auditRouter: AuditRouter;
  /** @purpose Router for Review Chat endpoints — undefined unless `config.chat` is supplied (TSK-133). */
  protected _chatRouter: ChatRouter | undefined;
  /** @purpose Router for the mutate endpoint — undefined unless `config.chat` is supplied (TSK-133). */
  protected _mutateRouter: MutateRouter | undefined;
  /** @purpose Durable mutation consumer recovered before this server exposes its live HTTP surface. */
  protected _mutationRuntime: MutationRuntime | undefined;
  /** @purpose Router for the boot endpoint — always available (no DI). */
  protected _bootRouter: BootRouter;
  /** @purpose Router for the state endpoint — available when inboxApi is configured. */
  protected _stateRouter: StateRouter | undefined;
  /** @purpose Router for the feed endpoint — available when inboxApi is configured. */
  protected _feedRouter: FeedRouter | undefined;
  /** @purpose Router for the task endpoint — available when inboxApi is configured. */
  protected _taskRouter: TaskRouter | undefined;
  /** @purpose Router for the decision endpoint — available when inboxApi is configured. */
  protected _decisionRouter: DecisionRouter | undefined;
  /** @purpose Router for the stream endpoint — available when inboxApi is configured. */
  protected _streamRouter: StreamRouter | undefined;
  /** @purpose SseHub shared between stream router and board projection — created when inboxApi is configured, reused by chat if present. */
  protected _sseHub: SseHub | undefined;
  /** @purpose Live board projection — retained so late-arriving sync snapshots can warm the board cache. */
  protected _boardProjection: BoardProjection | undefined;
  /** @purpose Static file server. */
  protected _staticFiles: StaticFiles;
  /** @purpose Track connection sockets so they can be unreffed at stop(). */
  protected _sockets: Set<import('node:net').Socket> = new Set();

  /**
   * @purpose Create an HttpServer with routing wired to the given board provider.
   * @param config Server configuration — port, boardProvider, optional staticDir.
   */
  constructor(config: HttpServerConfig) {
    this._config = config;
    this._boardRouter = new BoardRouter(config.boardProvider);
    this._mrRouter = new MrRouter(config.boardProvider);
    this._diagnosticsRouter = new DiagnosticsRouter();
    this._artifactRouter = new ArtifactRouter(config.boardProvider);
    this._auditRouter = new AuditRouter(config.boardProvider);
    this._staticFiles = new StaticFiles(config.staticDir);
    this._bootRouter = new BootRouter(config.bootReadiness);

    this._wireRuntime(config);
  }

  /**
   * @purpose Attach the fully assembled runtime after the boot endpoint has started listening.
   * @invariant `GET /api/boot` is intentionally available while adapters are being connected;
   *   all other routers are atomically rebound before bootstrap reports ready.
   * @param config Final dependency graph for board, chat, and inbox-v2 routes.
   * @returns Completion after durable mutation recovery has finished for the attached runtime.
   */
  async attachRuntime(config: HttpServerConfig): Promise<void> {
    this._config = { ...this._config, ...config };
    this._boardRouter = new BoardRouter(config.boardProvider);
    this._mrRouter = new MrRouter(config.boardProvider);
    this._artifactRouter = new ArtifactRouter(config.boardProvider);
    this._auditRouter = new AuditRouter(config.boardProvider);
    this._wireRuntime(this._config);
    // The bootstrap server is already listening for `/api/boot` at this point. Keep the two
    // operator write surfaces unavailable until recovery has replayed every durable MR journal;
    // otherwise a request racing attachRuntime could advance a fresh task beside its recovered
    // predecessor.
    const chatRouter = this._chatRouter;
    const mutateRouter = this._mutateRouter;
    this._chatRouter = undefined;
    this._mutateRouter = undefined;
    await this._recoverMutations();
    this._chatRouter = chatRouter;
    this._mutateRouter = mutateRouter;
  }

  /**
   * @purpose Push freshly synced snapshots into the live board projection (slow-bootstrap path).
   * @param snapshots Fresh twoTierSync snapshots.
   */
  updateInboxSnapshots(snapshots: SyncSnapshot[]): void {
    this._boardProjection?.updateSnapshots(snapshots);
  }

  /**
   * @purpose Assemble optional routers at construction and after bootstrap DI completes.
   * @param config Runtime dependencies to wire.
   */
  protected _wireRuntime(config: HttpServerConfig): void {
    this._chatRouter = undefined;
    this._mutateRouter = undefined;
    this._mutationRuntime = undefined;
    this._stateRouter = undefined;
    this._feedRouter = undefined;
    this._taskRouter = undefined;
    this._decisionRouter = undefined;
    this._streamRouter = undefined;
    this._sseHub = undefined;
    this._boardProjection = undefined;

    // #region START_WIRE_CHAT — invariant: ChatRouter and MutateRouter share one SseHub/MutationApplier so both event families broadcast over the same per-MR channel (D-100, D-110, TSK-133)
    if (config.chat) {
      const sseHub = new SseHub();
      this._sseHub = sseHub;
      const mutationApplier = new MutationApplier({ store: config.chat.store });
      const mutationFlow = config.chat.queue
        ? new MutationFlow({ queue: config.chat.queue, stateDir: config.chat.store.getStateDir() })
        : undefined;
      const mutationRuntime =
        mutationFlow && config.chat.queue && config.chat.journal
          ? new MutationRuntime({
              applier: mutationApplier,
              queue: config.chat.queue,
              journal: config.chat.journal,
              registry: config.chat.taskRegistry,
              sessionRouter: config.chat.sessionRouter,
            })
          : undefined;
      this._mutationRuntime = mutationRuntime;
      this._chatRouter = new ChatRouter({
        pool: config.chat.pool,
        store: config.chat.store,
        mutationApplier,
        mutationRuntime,
        sseHub,
        queue: config.chat.queue,
        journal: config.chat.journal,
        sessionRouter: config.chat.sessionRouter,
      });
      this._mutateRouter = new MutateRouter({
        mutationApplier,
        mutationFlow,
        mutationRuntime,
        queue: config.chat.queue,
        sseHub,
        journal: config.chat.journal,
      });

      // Wire dry-run broadcast (TSK-131): suppressed external writes (EffectExecutor VCS mutations,
      // RightsEscalator DMs) fan out over this server's SSE hub to every connected dashboard, which
      // console.logs them — the browser-observable proof no real write happened.
      setDryRunBroadcaster((entry) => sseHub.broadcastAll({ type: 'dryrun', ...entry }));
    }
    // #endregion END_WIRE_CHAT

    // #region START_WIRE_INBOX_API — wire inbox-api v2 routers (TSK-162): boot/state/feed/task/decision/stream with live projections
    if (config.inboxApi) {
      const hub = this._sseHub ?? config.inboxApi.sseHub ?? new SseHub();
      this._sseHub = hub;

      this._taskRouter = new TaskRouter(config.inboxApi.queue);
      this._decisionRouter = new DecisionRouter(
        config.inboxApi.decisionJournal,
        config.inboxApi.queue,
        config.inboxApi.resolveDecisionJournal,
        config.inboxApi.onDecision
      );

      const snapshots = config.inboxApi.snapshots ?? [];
      const boardProjection = new BoardProjection(
        snapshots,
        config.inboxApi.journal,
        config.inboxApi.registry,
        hub,
        config.inboxApi.loadSnapshots
      );
      const feedProjection = new FeedProjection(config.inboxApi.journal, config.inboxApi.registry);

      this._boardRouter.setProjection(boardProjection);
      this._boardProjection = boardProjection;
      this._stateRouter = new StateRouter(config.inboxApi.queue, boardProjection, feedProjection);
      this._feedRouter = new FeedRouter(feedProjection);
      this._streamRouter = new StreamRouter(hub);

      logger.info('[HttpServer#constructor] [inboxApi → wired]', {
        snapshotsCount: snapshots.length,
      });
    }
    // #endregion END_WIRE_INBOX_API
  }

  /**
   * @purpose Start the server — begin listening on the configured port.
   * @returns Promise that resolves when the server is listening.
   * @sideEffect Binds to port, registers request handler.
   */
  start(): Promise<void> {
    return this._recoverMutations().then(
      () =>
        new Promise((resolve, reject) => {
          if (this._server) {
            // Bootstrap starts the boot surface before connecting external adapters. Existing CLI and
            // test call sites may still call start() after bootstrap, so this is deliberately safe.
            resolve();
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
        })
    );
  }

  /**
   * @purpose Complete durable mutation recovery before a live router can accept another request.
   * @invariant A fresh HttpServer recreates its MutationRuntime from the same journal, so restart
   *   recovery cannot depend on a test-only direct `recover(mr)` call.
   * @returns Completion after every discovered MR has been replayed.
   */
  protected async _recoverMutations(): Promise<void> {
    if (!this._mutationRuntime) return;
    const recovered = await this._mutationRuntime.recoverAll();
    if (recovered.length > 0) {
      logger.info('[HttpServer#_recoverMutations] [boot → recovered]', {
        taskIds: recovered.map((result) => result.taskId),
      });
    }
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

      const srv = this._server;
      logger.info('[HttpServer#stop] [listening → stopping]', { port: this._config.port });

      setDryRunBroadcaster(null);

      let stopped = false;
      const finish = async () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(fallback);
        srv.removeListener('close', finish);
        // Unref all tracked sockets so they never pin the event loop.
        for (const socket of this._sockets) {
          socket.unref();
        }
        this._sockets.clear();
        srv.unref();
        this._server = null;
        // Yield one tick to let libuv process native handle cleanup before resolve.
        await new Promise((r) => setTimeout(r, 0));
        logger.info('[HttpServer#stop] [stopping → stopped]');
        resolve();
      };

      const fallback = setTimeout(() => finish(), 2000);

      srv.on('close', finish);
      srv.closeIdleConnections();
      srv.closeAllConnections();
      srv.close();
    });
  }

  /**
   * @purpose Return the actual bound port, including a kernel-assigned port when config.port is zero.
   * @returns Bound TCP port, or null before the server begins listening.
   */
  listeningPort(): number | null {
    const address = this._server?.address();
    return address && typeof address !== 'string' ? address.port : null;
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

    if (this._diagnosticsRouter.matches(req)) {
      this._diagnosticsRouter.handle(req, res);
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

    if (this._bootRouter.matches(req)) {
      this._bootRouter.handle(req, res);
      return;
    }

    if (this._stateRouter?.matches(req)) {
      this._stateRouter.handle(req, res);
      return;
    }

    if (this._feedRouter?.matches(req)) {
      this._feedRouter.handle(req, res);
      return;
    }

    if (this._taskRouter?.matches(req)) {
      void this._taskRouter.handle(req, res);
      return;
    }

    if (this._decisionRouter?.matches(req)) {
      void this._decisionRouter.handle(req, res);
      return;
    }

    if (this._streamRouter?.matches(req)) {
      this._streamRouter.handle(req, res);
      return;
    }

    // Check if it looks like an API path but didn't match any route
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      sendDomainError(res, 404, 'not_found', 'Unknown API route');
      return;
    }

    // SPA fallback — serve static files or index.html
    this._staticFiles.serve(req, res);
  }
}
