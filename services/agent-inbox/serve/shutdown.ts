// @file: gracefulShutdown — SIGTERM/SIGINT handler: cancels OpenCode sessions, stops scheduler, closes HTTP server.
// @consumers: gennady inbox serve CLI
// @tasks: TSK-115

import { logger } from '#logger';
import type { HttpServer } from '../modules/inbox-api/http-server.ts';

/**
 * @purpose Configuration for graceful shutdown.
 * @consumer gracefulShutdown
 */
export type ShutdownConfig = {
  /** @purpose HTTP server to close gracefully. */
  server: HttpServer;
  /** @purpose Optional timeout in ms for HTTP server close (default: 10_000). */
  timeout?: number;
};

/**
 * @purpose Gracefully stop HTTP server with configurable timeout.
 * Forces exit if timeout exceeded. Caller handles tick interval and process.exit().
 * @param config Shutdown configuration — server handle.
 * @returns Promise that resolves when the server is fully closed.
 * @sideEffect Closes the HTTP server; may call process.exit(0) on timeout.
 */
export async function gracefulShutdown(config: ShutdownConfig): Promise<void> {
  const timeout = config.timeout ?? 10_000;

  logger.info('[gracefulShutdown] [running → stopping] Shutdown signal received');

  // #region START_CLOSE_SERVER
  // Stop the HTTP server — stop accepting new connections, drain active ones.
  try {
    // Use a timer to enforce the timeout
    const shutdownTimer = setTimeout(() => {
      logger.warn('[gracefulShutdown] server close timed out, forcing exit');
      process.exit(0);
    }, timeout);

    await config.server.stop();
    clearTimeout(shutdownTimer);

    logger.info('[gracefulShutdown] [stopping → stopped] HTTP server closed');
  } catch (cause) {
    logger.error('[gracefulShutdown] [stopping → failed]', {
      error: (cause as Error).message,
    });
  }
  // #endregion END_CLOSE_SERVER
}
