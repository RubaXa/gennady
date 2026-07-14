#!/usr/bin/env node
// @file: CLI command: inbox serve — start the agent-inbox HTTP server + AI engine, or (with
//   --mrs) run a one-shot dry-run pass over a fixed MR list through the real role graph.
// @consumers: gennady.ts (served via `gennady inbox serve`)
// @tasks: TSK-115, TSK-121

import { style } from '../../../shared/common/style.ts';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bootstrap } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { gracefulShutdown } from '../../../services/agent-inbox/serve/shutdown.ts';
import { isOpencodePid } from '../../../services/agent-inbox/serve/pid-utils.ts';
import { runMrsOnce } from '../../../services/agent-inbox/serve/run-mode.ts';
import { loadSeedState, type SeedState } from '../../../services/agent-inbox/serve/state-seed.ts';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { RoleEngine } from '../../../services/agent-inbox/modules/inbox-roles/role-engine.ts';
import { VcsInboxMock } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.mock.ts';
import { VcsInboxReal } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts';
import type { VcsInboxPort } from '../../../services/agent-inbox/modules/inbox-core/vcs-inbox.port.ts';
import { OpenCodeMock } from '../../../services/agent-inbox/modules/inbox-opencode/opencode.mock.ts';
import { OpenCodeReal } from '../../../services/agent-inbox/modules/inbox-opencode/opencode.real.ts';
import type { OpenCodePort } from '../../../services/agent-inbox/modules/inbox-opencode/opencode.port.ts';

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

// ═══════════════════════════════════════════════════════════════
// Run-mode: --mrs <urls|@fixture> --seed <path|@fixture> --once --dry-run
// ═══════════════════════════════════════════════════════════════

/** @purpose Built-in fixture MR — local eval smoke-testing without a real GitLab. */
const FIXTURE_MR_URL = 'https://gitlab.example.com/group/project/-/merge_requests/510';

/** @purpose Fixture MR list for `--mrs @fixture`. */
const FIXTURE_MRS: string[] = [FIXTURE_MR_URL];

/** @purpose Fixture seed for `--seed @fixture` — pairs with FIXTURE_MRS as a never-reviewed MR. */
const FIXTURE_SEED: SeedState = { version: 1, mrs: { [FIXTURE_MR_URL]: { state: 'fresh' } } };

/**
 * @purpose Read a flag's value, supporting both `--flag=value` and `--flag value` syntax.
 * @param argv Remaining CLI arguments.
 * @param flag Flag name including its leading dashes (e.g. '--mrs').
 * @returns The flag's value, or undefined when absent.
 */
function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/**
 * @purpose Resolve `--mrs` into a concrete MR URL list.
 * @param value Raw flag value: comma-separated URLs, or the literal '@fixture'.
 * @returns Parsed MR URL list.
 */
function resolveMrsList(value: string): string[] {
  if (value === '@fixture') return FIXTURE_MRS;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @purpose Resolve `--seed` into a validated SeedState.
 * @param value Raw flag value: a file path, or the literal '@fixture'.
 * @returns Validated seed state.
 * @sideEffect Filesystem read when value is a path.
 */
async function resolveSeedState(value: string): Promise<SeedState> {
  if (value === '@fixture') return FIXTURE_SEED;
  return loadSeedState(value);
}

/**
 * @purpose Entry point for `gennady inbox serve --mrs ...` — one-shot dry-run pass, no HTTP server.
 * @invariant `--mrs` requires `--once` — run-mode is a single bounded pass, not a --loop variant;
 *   the flag keeps that explicit rather than silently ignored.
 * @invariant Non-mocks branch assumes an already-running `opencode serve` on the default port —
 *   `bootstrap.ts`'s spawn/health-check lifecycle is not duplicated for this one-shot call.
 * @param argv Remaining CLI arguments (argv.slice(3)).
 * @param mrsValue Raw `--mrs` flag value (already known to be present).
 * @param mocks Whether `--mocks` was passed — selects VcsInboxMock/OpenCodeMock vs the real adapters.
 * @returns Process exit code.
 * @sideEffect Prints the per-MR JSON result to stdout; network/filesystem per `runMrsOnce`.
 */
async function runRunModeCli(argv: string[], mrsValue: string, mocks: boolean): Promise<number> {
  try {
    if (!argv.includes('--once')) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        '--mrs требует --once (run-mode — единственный однопроходный режим)'
      );
      return 1;
    }

    const mrs = resolveMrsList(mrsValue);
    const seedValue = parseValue(argv, '--seed');
    const seedState = seedValue ? await resolveSeedState(seedValue) : undefined;
    const dryRun = parseValue(argv, '--dry-run') !== 'false';

    console.info(style.bold('gennady inbox serve --mrs (run-mode, dry-run)'));
    console.info('');

    const store = new StateStore();
    const engine = new RoleEngine();
    await engine.loadAll();

    const vcs: VcsInboxPort = mocks
      ? new VcsInboxMock()
      : new VcsInboxReal({ token: process.env.GITLAB_PERSONAL_TOKEN });
    const opencode: OpenCodePort = mocks
      ? new OpenCodeMock()
      : new OpenCodeReal({ directory: store.getStateDir(), baseUrl: 'http://localhost:4096' });

    // invariant: --mocks must stay network-free; the live default (fetchDiffRefsLive) would
    // still hit the real GitLab API otherwise
    const fetchDiffRefs = mocks ? async () => undefined : undefined;

    const result = await runMrsOnce({
      mrs,
      seedState,
      dryRun,
      deps: { engine, store, vcs, opencode, fetchDiffRefs },
    });

    console.info(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(style.redBright.bold('✖ Ошибка:'), (error as Error).message);
    return 1;
  }
}

async function run(): Promise<number> {
  try {
    const argv = process.argv.slice(3);
    const { mocks, port } = parseOptions(argv);

    // #region START_RUN_MODE_DISPATCH — invariant: --mrs bypasses the HTTP server entirely, it is
    // a one-shot batch pass (TSK-121), never the interactive foreground server below
    const mrsValue = parseValue(argv, '--mrs');
    if (mrsValue) {
      return await runRunModeCli(argv, mrsValue, mocks);
    }
    // #endregion END_RUN_MODE_DISPATCH

    // #region START_BOOTSTRAP — assemble DI, verify config and adapters
    console.info(style.bold('gennady inbox serve'));
    console.info('');

    // D-85: Check if another instance is already running (S1: verify PID via isOpencodePid)
    const defaultStateDir = join(homedir(), '.gennady');
    const pidFile = join(defaultStateDir, 'agent-inbox', 'opencode.pid');
    if (existsSync(pidFile)) {
      try {
        const raw = readFileSync(pidFile, 'utf-8');
        const { pid, port } = JSON.parse(raw) as { pid: number; port: number };
        if (isOpencodePid(pid)) {
          console.info(style.yellow(`⚠ Уже запущен на порту ${port} (PID ${pid})`));
          return 0;
        }
        // Stale PID file — remove and continue
        try {
          unlinkSync(pidFile);
        } catch {
          /* ignore */
        }
      } catch {
        /* Corrupted PID file — ignore and continue */
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
    const shutdown = async (signal: string, exitCode: number = 0) => {
      console.info('');
      console.info(style.dim(`Received ${signal}, shutting down...`));
      clearInterval(tickTimer);
      try {
        await gracefulShutdown({
          server: result.server,
          opencode: result.opencode,
          opencodeProcess: result.opencodeProcess,
          opencodePidFile: result.opencodePidFile,
          scheduler: result.scheduler,
        });
      } catch {
        // Individual shutdown errors are logged inside gracefulShutdown
      }
      process.exit(exitCode);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error(style.redBright.bold('✖ Unhandled error:'), error.message);
      void shutdown('uncaughtException', 1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error(style.redBright.bold('✖ Unhandled rejection:'), reason);
      void shutdown('unhandledRejection', 1);
    });
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
