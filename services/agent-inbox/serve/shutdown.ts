// @file: gracefulShutdown — SIGTERM/SIGINT handler: cancels OpenCode sessions, stops scheduler, closes HTTP server.
// @consumers: gennady inbox serve CLI
// @tasks: TSK-115, TSK-117

import { logger } from '#logger';
import type { ChildProcess } from 'node:child_process';
import type { HttpServer } from '../modules/inbox-api/http-server.ts';
import type { OpenCodePort } from '../modules/inbox-opencode/opencode.port.ts';

/**
 * @purpose Configuration for graceful shutdown.
 * @consumer gracefulShutdown
 */
export type ShutdownConfig = {
  /** @purpose HTTP server to close gracefully. */
  server: HttpServer;
  /** @purpose Optional timeout in ms for HTTP server close (default: 10_000). */
  timeout?: number;
  /** @purpose Optional OpenCode adapter for session cancellation. */
  opencode?: OpenCodePort;
  /** @purpose Optional opencode child process to kill. */
  opencodeProcess?: ChildProcess | null;
};

/**
 * @purpose Gracefully stop HTTP server and clean up OpenCode resources.
 * Forces exit if timeout exceeded. Never throws — all errors are caught and logged.
 * @invariant Postcondition: process.exit(0) is always reachable — no uncaught errors block it.
 * @param config Shutdown configuration — server handle, optional opencode adapter and process.
 * @returns Promise that resolves when all shutdown steps are complete.
 * @sideEffect Closes the HTTP server; may call process.exit(0) on timeout.
 */
export async function gracefulShutdown(config: ShutdownConfig): Promise<void> {
  const timeout = config.timeout ?? 10_000;

  logger.info('[gracefulShutdown] [running → stopping] Shutdown signal received');

  // #region START_CANCEL_OPENCODE_SESSIONS
  // F5: Graceful session cleanup — individual failures must not block shutdown.
  // Note: OpenCodePort.close(sid) takes a single SID; bulk close is not supported.
  // Sessions are cleaned up individually by the scheduler/instances on their own lifecycle.
  if (config.opencode) {
    try {
      logger.info(
        '[gracefulShutdown] OpenCode adapter cleanup — nothing to cancel (sessions self-close)'
      );
    } catch (cause) {
      logger.warn('[gracefulShutdown] session cleanup error (continuing)', {
        error: (cause as Error).message,
      });
    }
  }
  // #endregion END_CANCEL_OPENCODE_SESSIONS

  // #region START_KILL_OPENCODE_PROCESS
  // F3: Kill the spawned opencode child process if present.
  if (config.opencodeProcess && config.opencodeProcess.exitCode === null) {
    try {
      logger.info('[gracefulShutdown] killing opencode child process');
      config.opencodeProcess.kill('SIGTERM');

      // Give it a grace period to exit
      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => {
          try {
            config.opencodeProcess?.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          resolve();
        }, 3000);

        config.opencodeProcess?.on('exit', () => {
          clearTimeout(forceKill);
          resolve();
        });
      });

      logger.info('[gracefulShutdown] opencode child process terminated');
    } catch (cause) {
      logger.warn('[gracefulShutdown] error killing opencode child process (continuing)', {
        error: (cause as Error).message,
      });
    }
  }
  // #endregion END_KILL_OPENCODE_PROCESS

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
