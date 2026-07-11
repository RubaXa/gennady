#!/usr/bin/env node
// @file: CLI command: inbox serve — start the agent-inbox HTTP server + AI engine.
// @consumers: gennady.ts (served via `gennady inbox serve`)
// @tasks: TSK-115

import { style } from '../../../shared/common/style.ts';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bootstrap } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { gracefulShutdown } from '../../../services/agent-inbox/serve/shutdown.ts';

/**
 * @purpose Parse command-line flags for `gennady inbox serve`.
 * @param argv Remaining CLI arguments (argv.slice(3)).
 * @returns Parsed options: mocks flag and optional port.
 */
function parseOptions(argv: string[]): { mocks: boolean; port?: number } {
  const mocks = argv.includes('--mocks');
  const portArg = argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.slice('--port='.length)) : undefined;

  if (port !== undefined && (!Number.isFinite(port) || port < 1 || port > 65535)) {
    console.error(style.redBright.bold('✖ Ошибка:'), `Некорректный порт: ${portArg}`);
    process.exit(1);
  }

  return { mocks, port };
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(3);
    const { mocks, port } = parseOptions(argv);

    // #region START_BOOTSTRAP — assemble DI, verify config and adapters
    console.info(style.bold('gennady inbox serve'));
    console.info('');

    // D-85: Check if another instance is already running
    const defaultStateDir = join(homedir(), '.gennady');
    const pidFile = join(defaultStateDir, 'agent-inbox', 'opencode.pid');
    if (existsSync(pidFile)) {
      try {
        const raw = readFileSync(pidFile, 'utf-8');
        const { pid, port } = JSON.parse(raw) as { pid: number; port: number };
        try {
          process.kill(pid, 0); // Signal 0 = check if process exists
          console.info(style.yellow(`⚠ Уже запущен на порту ${port} (PID ${pid})`));
          return 0;
        } catch {
          // PID file exists but process is dead — stale file, remove and continue
          try {
            unlinkSync(pidFile);
          } catch {
            /* ignore */
          }
        }
      } catch {
        // Corrupted PID file — ignore and continue
      }
    }

    const result = await bootstrap({ mocks, port });

    // #endregion END_BOOTSTRAP

    await result.server.start();

    // #region START_TICK_TIMER — polling loop for role scheduler
    const tickTimer = setInterval(() => {
      void result.scheduler.tick();
    }, result.pollingInterval);

    // Run the first tick immediately (non-blocking)
    void result.scheduler.tick();
    // #endregion END_TICK_TIMER

    // #region START_STATUS_BAR
    console.info('');
    console.info(
      `${style.green('✓')} Server started on ${style.bold(`http://localhost:${result.port}`)}`
    );
    console.info(`  OpenCode:     ${style.cyan(result.opencodeStatus)}`);
    console.info(`  Polling:      every ${Math.round(result.pollingInterval / 1000)}s`);
    console.info(`  Roles:        ${result.roles.map((r) => style.cyan(r)).join(', ')}`);
    if (result.degraded) {
      console.info(
        `  ${style.yellow('⚠')} AI engine degraded — dashboard available, AI steps disabled`
      );
    }
    console.info('');
    console.info(style.dim('Press Ctrl+C to stop'));
    // #endregion END_STATUS_BAR

    // #region START_SIGNAL_HANDLERS
    const shutdown = async (signal: string) => {
      console.info('');
      console.info(style.dim(`Received ${signal}, shutting down...`));
      clearInterval(tickTimer);
      // F5: Pass opencode adapter and process for clean cancellation
      try {
        await gracefulShutdown({
          server: result.server,
          opencode: result.opencode,
          opencodeProcess: result.opencodeProcess,
          opencodePidFile: result.opencodePidFile,
        });
      } catch {
        // Ensure we always exit with 0 — individual shutdown errors are logged inside gracefulShutdown
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
    // #endregion END_SIGNAL_HANDLERS

    // Foreground-сервер: процесс живёт до SIGTERM/SIGINT (выход — внутри shutdown).
    return await new Promise<number>(() => {});
  } catch (error) {
    // #region START_ERROR_HANDLING
    const message = (error as Error).message ?? String(error);

    // Known startup errors — print clean messages
    if (message.includes('не настроен')) {
      console.info(style.yellow(`ℹ ${message}`));
      return 0;
    }
    if (message.includes('opencode not found')) {
      console.error(style.redBright.bold('✖ Ошибка:'), message);
      console.info(
        style.dim('  Установите @opencode-ai/sdk или запустите с флагом --mocks для dev-режима.')
      );
      return 1;
    }

    console.error(style.redBright.bold('✖ Ошибка:'), message);
    return 1;
    // #endregion END_ERROR_HANDLING
  }
}

process.exit(await run());
