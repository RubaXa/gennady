// @file: Provider contract — extension point for new agent systems
// @consumers: monitor, providers/claude, providers/opencode
// @tasks: TSK-35

import type { AgentSession } from './agent-session.type.js';
import type { ScanOpts } from './scan-opts.type.js';

/**
 * @purpose Contract for agent session providers — single extension point for new agent systems.
 * @invariant Scan is stateless: calling scan() does not change provider state.
 * @invariant Error policy: scan failures return empty array ([]), never propagate to scanAll() — graceful degradation.
 * @invariant Read-only: scan() must not write to the source data.
 */
export interface AgentProvider {
  /** @purpose Unique provider key for registration | @invariant Non-empty string, unique per AgentMonitor */
  readonly key: string;

  /**
   * @purpose Scan the provider's source and return normalized agent sessions.
   * @param opts Optional scan filtering parameters.
   * @throws Never — failures return [] per graceful degradation contract.
   * @returns Normalized agent sessions (may be empty).
   * @sideEffect Read access to provider's data source (filesystem, database).
   */
  scan(opts?: ScanOpts): Promise<AgentSession[]>;
}
