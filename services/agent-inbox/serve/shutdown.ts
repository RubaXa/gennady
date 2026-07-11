// @file: gracefulShutdown — SIGTERM/SIGINT handler: cancels OpenCode sessions, stops scheduler, closes HTTP server.
// @consumers: gennady inbox serve CLI
// @tasks: TSK-115, TSK-117

import { readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logger } from '#logger';
import type { ChildProcess } from 'node:child_process';
import type { HttpServer } from '../modules/inbox-api/http-server.ts';
import type { OpenCodePort } from '../modules/inbox-opencode/opencode.port.ts';
import type { RoleScheduler } from '../modules/inbox-roles/role-scheduler.ts';

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
  /** @purpose Optional opencode child process to kill (fallback if no PID file). */
  opencodeProcess?: ChildProcess | null;
  /** @purpose Path to opencode PID file — primary method: kill by PID, then remove file. */
  opencodePidFile?: string | null;
  /** @purpose Optional scheduler to stop before closing HTTP server. */
  scheduler?: RoleScheduler;
};

/**
 * @purpose Gracefully stop HTTP server and clean up OpenCode resources.
 * Forces exit if timeout exceeded. Never throws — all errors are caught and logged.
 * @invariant Postcondition: resolves cleanly — caller handles exit code.
 * @param config Shutdown configuration — server handle, optional opencode adapter and process.
 * @returns Promise that resolves when all shutdown steps are complete.
 * @sideEffect Closes the HTTP server; logs timeout warnings but does NOT call process.exit.
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
  if (config.opencodePidFile && existsSync(config.opencodePidFile)) {
    try {
      const raw = await readFile(config.opencodePidFile, 'utf-8');
      const { pid } = JSON.parse(raw) as { pid: number; port: number };
      logger.info('[gracefulShutdown] killing opencode by PID', { pid });

      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* process already dead */
      }

      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* ignore */
          }
          resolve();
        }, 5000);

        const check = setInterval(() => {
          try {
            process.kill(pid, 0);
          } catch {
            clearTimeout(forceKill);
            clearInterval(check);
            resolve();
          }
        }, 200);
      });

      try {
        await unlink(config.opencodePidFile);
      } catch {
        /* ignore */
      }
      logger.info('[gracefulShutdown] opencode terminated, PID file removed');
    } catch (cause) {
      logger.warn('[gracefulShutdown] error reading/killing by PID file (continuing)', {
        error: (cause as Error).message,
      });
    }
  } else if (config.opencodeProcess && config.opencodeProcess.exitCode === null) {
    try {
      logger.info('[gracefulShutdown] killing opencode child process (fallback)');
      config.opencodeProcess.kill('SIGTERM');

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

  // #region START_STOP_SCHEDULER
  if (config.scheduler) {
    try {
      logger.info('[gracefulShutdown] stopping scheduler');
      await config.scheduler.stop();
    } catch (cause) {
      logger.warn('[gracefulShutdown] scheduler stop error (continuing)', {
        error: (cause as Error).message,
      });
    }
  }
  // #endregion END_STOP_SCHEDULER

  // #region START_CLOSE_SERVER
  // Stop the HTTP server — stop accepting new connections, drain active ones.
  try {
    // Race server.stop() against a timeout — resolve cleanly either way.
    // Caller (serve.cmd.ts) handles process.exit() code.
    const stopPromise = config.server.stop().then(() => {
      logger.info('[gracefulShutdown] [stopping → stopped] HTTP server closed');
    });
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn('[gracefulShutdown] server close timed out');
        resolve();
      }, timeout);
    });

    await Promise.race([stopPromise, timeoutPromise]);
  } catch (cause) {
    logger.error('[gracefulShutdown] [stopping → failed]', {
      error: (cause as Error).message,
    });
  }
  // #endregion END_CLOSE_SERVER
}
