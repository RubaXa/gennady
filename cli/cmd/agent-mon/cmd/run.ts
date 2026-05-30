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
  process.stderr.write(
    '  --provider <name>   Filter by provider: claude, opencode, all (default: all)\n'
  );
  process.stderr.write(
    '  --view <name>       Dashboard layout: column, compact (default: column)\n'
  );
  process.stderr.write('  --limit <N>         Max sessions per provider (default: 10)\n');
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
    limit: 10,
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
          printUsageAndExit(`Unknown provider: ${next}. Must be one of: claude, opencode, all`);
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
          printUsageAndExit(`Unknown view: ${next}. Must be one of: column, compact`);
        }
        flags.view = next as 'column' | 'compact';
        i++;
        break;
      }

      case '--limit': {
        const next = argv[i + 1];
        if (next === undefined) printUsageAndExit('--limit requires a value');
        const parsed = Number(next);
        if (Number.isNaN(parsed) || parsed < 1)
          printUsageAndExit(`--limit must be >= 1, got: ${next}`);
        flags.limit = parsed;
        i++;
        break;
      }

      case '--help':
      case '-h':
        printUsageAndExit();
        break;

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
      cause instanceof Error ? cause : new Error('[buildOnceViewModel] Scan failed', { cause });
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
 * @pre argv contains CLI flags per the agent-mon subcommand contract.
 * @param argv Argument vector (excluding the command name 'agent-mon').
 * @throws Never — on invalid input, prints usage and exits with code 1.
 * @returns void (process is kept alive by ink in live mode or exits after snapshot in --once).
 * @post Process is kept alive by ink (live mode) or exits after snapshot (--once).
 * @sideEffect Starts ink renderer; registers providers; may spawn observe polling loop.
 */
export async function run(argv: string[]): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const flags = parseFlags(argv);

  logger.debug(
    `[run] [parsing → parsed] once=${flags.once} interval=${flags.interval} provider=${flags.provider} view=${flags.view}`
  );

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
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const viewModel = await buildOnceViewModel(monitor, flags.limit);

    if (viewModel.status === 'error') {
      process.stderr.write = (() => true) as typeof process.stderr.write;
      console.error('Error:', viewModel.error?.message ?? 'Scan failed');
      process.exit(1);
    }

    const cols = viewModel.data?.columns ?? [];
    const total = viewModel.data?.summary?.total ?? 0;
    const W = process.stdout.columns ? Math.min(process.stdout.columns - 2, 80) : 78;

    function box(text: string) {
      const inner = W - 4;
      console.log(`  ┌${'─'.repeat(inner)}┐`);
      for (const line of text.split('\n')) {
        const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
        const pad = Math.max(0, inner - visible.length);
        console.log(`  │ ${line}${' '.repeat(pad)} │`);
      }
      console.log(`  └${'─'.repeat(inner)}┘`);
    }

    const icons: Record<string, string> = {
      active: '🔴',
      waiting: '⏳',
      idle: '🟡',
      completed: '⬜',
    };

    function cardText(c: any): string {
      const parts = [`${icons[c.status] ?? '?'} ${c.title.slice(0, 55)}`];
      const meta = [c.model, c.status, c.elapsed].filter(Boolean).join(' · ');
      parts.push(`   ${meta}`);
      if (c.tokensIn)
        parts.push(
          `   tok: ${Math.round(c.tokensIn / 1000)}k in / ${Math.round((c.tokensOut || 0) / 1000)}k out`
        );
      if (c.lastMessage) parts.push(`   ${c.lastMessage.slice(0, 60)}`);
      return parts.join('\n');
    }

    // Top: active + waiting cards
    const activeCards: any[] = [];
    for (const col of cols) {
      for (const c of col.sessions) {
        if (c.status === 'active' || c.status === 'waiting')
          activeCards.push({ ...c, _provider: col.provider });
      }
    }

    console.log(`\n  Agent Monitor — ${total} sessions — snapshot\n`);
    if (activeCards.length > 0) {
      console.log(`  🔴 ACTIVE / ⏳ WAITING (${activeCards.length})\n`);
      for (const c of activeCards.slice(0, 6)) box(cardText(c));
      if (activeCards.length > 6) console.log(`\n  ... +${activeCards.length - 6} more\n`);
    } else {
      console.log('  No active sessions.\n');
    }

    // Bottom: chronological list
    const allCards: any[] = [];
    for (const col of cols) {
      for (const c of col.sessions) allCards.push({ ...c, _provider: col.provider });
    }
    console.log(`  📋 RECENT (${total} total)\n`);
    for (const s of allCards.slice(0, 8)) {
      const icon = icons[s.status] ?? '?';
      const prov = s._provider.padEnd(8);
      const model = (s.model ?? '?').padEnd(16);
      const title = s.title.slice(0, 40);
      console.log(`  ${icon} ${prov} ${model} ${title}`);
    }
    console.log();

    process.exit(0);
  }
  // #endregion END_ONCE_MODE

  // #region START_LIVE_MODE — invariant: observe async iterable feeds state manager; ink render keeps process alive
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write; // suppress logger noise during live mode

  const changes = observe(monitor, { interval: flags.interval });
  const sm = createStateManager(changes, { limit: flags.limit });

  render(React.createElement(AgentMonApp, { stateManager: sm, view: flags.view }));

  // Restore stderr on exit for cleanup messages
  process.on('exit', () => {
    process.stderr.write = originalStderrWrite;
  });
  // #endregion END_LIVE_MODE
}
