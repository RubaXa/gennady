// @file: CLI entry point — parses flags, wires providers and state, renders ink dashboard.
// @consumers: cli/gennady.ts
// @tasks: TSK-47

import { render } from 'ink';
import React from 'react';
import { logger } from '#logger';
import { createProviders, type CreateProvidersOpts } from './create-providers.ts';
import { createStateManager } from '../state/create-state-manager.ts';
import type { ViewModel } from '../state/view-model.type.ts';
import { observe } from '../../../../services/agent-mon/observe/observe.ts';
import { groupByProvider } from '../state/group-by-provider.ts';
import { AgentMonApp } from '../ui/app.tsx';
import type { AgentMonitor } from '../../../../services/agent-mon/monitor/agent-monitor.ts';

/** @purpose Parsed CLI flags for the agent-mon command. */
type CliFlags = {
  once: boolean;
  interval: number;
  provider: 'claude' | 'opencode' | 'all';
  view: 'column' | 'compact';
  limit: number;
};

/** @purpose Allowed --provider values */
const ALLOWED_PROVIDERS = new Set(['claude', 'opencode', 'all']);

/** @purpose Allowed --view values */
const ALLOWED_VIEWS = new Set(['column', 'compact']);

/**
 * @purpose Render usage text to stderr and exit with code 1 — triggered by unknown or invalid flags.
 * @sideEffect Writes to stderr, calls process.exit(1).
 */
function printUsageAndExit(reason?: string): never {
  if (reason) {
    process.stderr.write(`Error: ${reason}\n\n`);
  }
  process.stderr.write('Usage: gennady agent-mon [options]\n');
  process.stderr.write('  --once              Snapshot mode — print dashboard and exit\n');
  process.stderr.write('  --interval <ms>     Polling interval in ms (default: 5000)\n');
  process.stderr.write('  --provider <name>   Filter by provider: claude, opencode, all (default: all)\n');
  process.stderr.write('  --limit <N>         Max sessions per provider (default: 20)\n');
  process.exit(1);
}

/**
 * @purpose Parse raw argument strings into typed CliFlags with validation.
 * @param argv Raw argument array (excluding command name).
 * @returns Validated CliFlags.
 * @throws process.exit(1) on invalid flags — follows fail-fast validation per AX_FAIL_FAST_VALIDATION.
 */
function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    once: false,
    interval: 5000,
    provider: 'all',
    view: 'column',
    limit: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--once':
        flags.once = true;
        break;

      case '--interval': {
        const next = argv[i + 1];
        if (next === undefined) {
          printUsageAndExit('--interval requires a value (ms)');
        }
        const parsed = Number(next);
        if (Number.isNaN(parsed) || parsed < 100) {
          printUsageAndExit(`--interval must be >= 100ms, got: ${next}`);
        }
        flags.interval = parsed;
        i++;
        break;
      }

      case '--provider': {
        const next = argv[i + 1];
        if (next === undefined) {
          printUsageAndExit('--provider requires a value (claude | opencode | all)');
        }
        if (!ALLOWED_PROVIDERS.has(next)) {
          printUsageAndExit(
            `Unknown provider: ${next}. Must be one of: claude, opencode, all`,
          );
        }
        flags.provider = next as 'claude' | 'opencode' | 'all';
        i++;
        break;
      }

      case '--view': {
        const next = argv[i + 1];
        if (next === undefined) {
          printUsageAndExit('--view requires a value (column | compact)');
        }
        if (!ALLOWED_VIEWS.has(next)) {
          printUsageAndExit(
            `Unknown view: ${next}. Must be one of: column, compact`,
          );
        }
        flags.view = next as 'column' | 'compact';
        i++;
        break;
      }

      case '--limit': {
        const next = argv[i + 1];
        if (next === undefined) printUsageAndExit('--limit requires a value');
        const parsed = Number(next);
        if (Number.isNaN(parsed) || parsed < 1) printUsageAndExit(`--limit must be >= 1, got: ${next}`);
        flags.limit = parsed;
        i++;
        break;
      }

      default:
        if (arg.startsWith('-')) {
          printUsageAndExit(`Unknown flag: ${arg}`);
        }
        printUsageAndExit(`Unexpected argument: ${arg}`);
    }
  }

  return flags;
}

/**
 * @purpose Build a one-shot ViewModel from a direct scan — used in --once mode.
 * @param monitor AgentMonitor with registered providers.
 * @returns ViewModel built from a single scanAll() call.
 */
async function buildOnceViewModel(monitor: AgentMonitor, limit: number): Promise<ViewModel> {
  // #region START_DIRECT_SCAN — invariant: scanAll provides fresh sessions; groupByProvider builds the ViewModel columns
  try {
    const sessions = await monitor.scanAll();
    const columns = groupByProvider(sessions, { limit });
    const byProvider: Record<string, number> = {};
    for (const col of columns) {
      byProvider[col.provider] = col.sessions.length;
    }

    return {
      status: 'ready',
      data: {
        columns,
        summary: {
          total: sessions.length,
          byProvider,
        },
      },
      lastUpdated: Date.now(),
    };
  } catch (cause) {
    const error =
      cause instanceof Error
        ? cause
        : new Error('[buildOnceViewModel] Scan failed', { cause });
    logger.error('[buildOnceViewModel] [scanning → failed]', { error });
    return {
      status: 'error',
      error,
      lastUpdated: Date.now(),
    };
  }
  // #endregion END_DIRECT_SCAN
}

/**
 * @purpose CLI entry point for `gennady agent-mon` — parse flags, wire providers, render the dashboard.
 * @invariant --once mode: single scan → build ViewModel → render + exit.
 * @invariant Live mode: observe → state manager → render, process kept alive by ink.
 * @param argv Argument vector (excluding the command name 'agent-mon').
 * @pre argv contains CLI flags per the agent-mon subcommand contract.
 * @post Process is kept alive by ink (live mode) or exits after snapshot (--once).
 * @throws Never — on invalid input, prints usage and exits with code 1.
 * @sideEffect Starts ink renderer; registers providers; may spawn observe polling loop.
 */
export async function run(argv: string[]): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const flags = parseFlags(argv);

  logger.debug(`[run] [parsing → parsed] once=${flags.once} interval=${flags.interval} provider=${flags.provider} view=${flags.view}`);

  // #region START_CREATE_PROVIDERS — invariant: provider filter controls which providers are registered
  const providerOpts: CreateProvidersOpts = {};
  if (flags.provider !== 'all') {
    providerOpts.claude = flags.provider === 'claude';
    providerOpts.opencode = flags.provider === 'opencode';
  }

  const monitor = createProviders(providerOpts);
  // #endregion END_CREATE_PROVIDERS

  // #region START_ONCE_MODE — invariant: direct scan, no observe loop; print as text and exit
  if (flags.once) {
    const viewModel = await buildOnceViewModel(monitor, flags.limit);

    if (viewModel.status === 'error') {
      console.error('Error:', viewModel.error?.message ?? 'Scan failed');
      process.exit(1);
    }

    const columns = viewModel.data?.columns ?? [];
    const summary = viewModel.data?.summary;
    console.log(`\n  ${summary?.total ?? 0} sessions${summary ? ` (${Object.entries(summary.byProvider).map(([k,v]) => `${k}: ${v}`).join(', ')})` : ''}\n`);

    for (const col of columns) {
      const statusIcon: Record<string, string> = { active: '○', waiting: '⏳', idle: '·', completed: '×' };
      console.log(`  ${col.provider} (${col.activeCount} active, ${col.waitingCount} waiting, ${col.idleCount} idle)`);
      for (const s of col.sessions.slice(0, 10)) {
        const icon = statusIcon[s.status] ?? '?';
        const elapsed = s.elapsed;
        const tok = s.tokensIn ? ` tok:${(s.tokensIn/1000).toFixed(0)}k` : '';
        console.log(`    ${icon} ${s.title.slice(0, 60)}  [${s.model ?? '?'}]  ${s.status}  ${elapsed}${tok}`);
      }
      if (col.sessions.length > 10) console.log(`    ... +${col.sessions.length - 10} more`);
      console.log();
    }

    process.exit(0);
  }
  // #endregion END_ONCE_MODE

  // #region START_LIVE_MODE — invariant: observe async iterable feeds state manager; ink render keeps process alive
  const changes = observe(monitor, { interval: flags.interval });
  const sm = createStateManager(changes, { limit: flags.limit });

  render(React.createElement(AgentMonApp, { stateManager: sm, view: flags.view }));
  // #endregion END_LIVE_MODE
}
