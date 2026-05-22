// @file: Provider factory — creates AgentMonitor with Claude and OpenCode providers registered.
// @consumers: cli/cmd/agent-mon/cmd/run
// @tasks: TSK-47

import { createMonitor, AgentMonitor } from '../../../../services/agent-mon/monitor/index.ts';
import { ClaudeProvider } from '../../../../services/agent-mon/providers/claude/index.ts';
import { OpenCodeProvider } from '../../../../services/agent-mon/providers/opencode/index.ts';
import { logger } from '#logger';

/** @purpose Options controlling which providers are registered. */
export type CreateProvidersOpts = {
  /** @purpose Register Claude provider | @invariant Default true when absent */
  claude?: boolean;
  /** @purpose Register OpenCode provider | @invariant Default true when absent */
  opencode?: boolean;
};

/**
 * @purpose Create an AgentMonitor and register Claude and OpenCode providers according to options.
 * @invariant Stateless — each call creates a fresh monitor instance.
 * @param opts Provider selection — both enabled by default.
 * @returns AgentMonitor with selected providers registered and ready for scanning.
 */
export function createProviders(opts?: CreateProvidersOpts): AgentMonitor {
  const monitor = createMonitor();

  logger.debug('[createProviders] [idle → registering]');

  // #region START_REGISTER_PROVIDERS — invariant: each enabled provider is registered with a unique key; failures are thrown per AgentMonitor contract
  if (opts?.claude !== false) {
    monitor.register('claude', new ClaudeProvider());
    logger.debug('[createProviders] [registering → claude_registered]');
  }

  if (opts?.opencode !== false) {
    monitor.register('opencode', new OpenCodeProvider());
    logger.debug('[createProviders] [registering → opencode_registered]');
  }
  // #endregion END_REGISTER_PROVIDERS

  logger.info(
    `[createProviders] [registering → ready] claude=${opts?.claude !== false} opencode=${opts?.opencode !== false}`,
  );
  return monitor;
}
