// @file: HttpServer — node:http server on port 4174 with routing, CORS, static files, graceful shutdown.
// @consumers: gennady inbox serve (CLI), e2e tests
// @tasks: TSK-106

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { logger } from '#logger';
import { BoardRouter } from './routers/board.router.ts';
import { MrRouter } from './routers/mr.router.ts';
import { ArtifactRouter } from './routers/artifact.router.ts';
import { AuditRouter } from './routers/audit.router.ts';
import { StaticFiles } from './static-files.ts';
import { setCorsHeaders, handlePreflight, sendJson } from './http-helpers.ts';
import type { BoardProviderPort } from './board-provider.port.ts';

/** @purpose Configuration for the HttpServer. */
export type HttpServerConfig = {
  /** @purpose Port to listen on (default: 4174). */
  port: number;
  /** @purpose Board provider implementation (mock or real). */
  boardProvider: BoardProviderPort;
  /** @purpose Path to static files directory (default: dist/inbox-serve). */
  staticDir?: string;
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
