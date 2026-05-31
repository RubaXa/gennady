// @file: AgentMonitor Service — provider registry and scan coordination
// @consumers: observe, CLI
// @tasks: TSK-36

import { logger } from '#logger';
import type { AgentProvider } from '../model/agent-provider.type.js';
import type { AgentSession } from '../model/agent-session.type.js';
import type { ScanOpts } from '../model/scan-opts.type.js';
import { DuplicateProviderError, ProviderNotFoundError } from '../model/errors.ts';

/**
 * @purpose Provider registry and scan coordination — owns the provider map, orchestrates scanning across all registered providers.
 * @invariant Undamaged-by-one: provider failure in scanAll does not interrupt remaining providers (graceful degradation per N3).
 * @invariant Stateless scans: no caching between calls; each scanAll / scanOne is a fresh invocation.
 */
/** @implements {AgentMonitor} in specs/agent-mon/monitor/monitor.spec.md#agentmonitor */
export class AgentMonitor {
  /** @purpose Provider registry — maps string keys to AgentProvider instances | @invariant Empty on construction; mutated only via register/unregister */
  protected readonly _providers: Map<string, AgentProvider> = new Map();

  /**
   * @purpose Register a provider under a unique key; rejects on duplicate.
   * @param key Unique provider identifier — non-empty string.
   * @param provider The provider instance implementing AgentProvider.
   * @throws {DuplicateProviderError} When key is already registered.
   * @post Provider is stored in the registry under the given key.
   */
  register(key: string, provider: AgentProvider): void {
    // // --- ENFORCE_UNIQUE_PROVIDER_KEY — invariant: provider keys must be unique; duplicate registration is a contract violation
    if (this._providers.has(key)) {
      throw new DuplicateProviderError(key);
    }
    // // --- end ENFORCE_UNIQUE_PROVIDER_KEY

    this._providers.set(key, provider);
    logger.debug(`[AgentMonitor#register] [idle → registered] ${key}`);
  }

  /**
   * @purpose Remove a provider from the registry; no-op when the key is not found.
   * @param key Provider key to remove.
   * @post Provider with the given key is no longer in the registry.
   */
  unregister(key: string): void {
    this._providers.delete(key);
    logger.debug(`[AgentMonitor#unregister] [registered → removed] ${key}`);
  }

  /**
   * @purpose Scan all registered providers concurrently, aggregate and sort results by startedAt descending.
   * @invariant Graceful degradation: a failing provider returns [] and does not abort other providers.
   * @param [opts] Optional scan filtering (since timestamp or 'today').
   * @returns All sessions from all providers, sorted by startedAt descending.
   * @sideEffect Calls each registered provider's scan() — may read filesystem / database.
   */
  async scanAll(opts?: ScanOpts): Promise<AgentSession[]> {
    logger.debug(`[AgentMonitor#scanAll] [idle → scanning] providers=${this._providers.size}`);

    // // --- GATHER_PROVIDER_SCANS — invariant: Promise.all preserves concurrency; individual failures are caught and logged per N3 graceful degradation
    const scans = await Promise.all(
      [...this._providers.values()].map(async (provider) => {
        try {
          return await provider.scan(opts);
        } catch (cause) {
          const error = new Error(`[AgentMonitor#scanAll] Provider ${provider.key} failed`, {
            cause,
          });
          logger.error(`[AgentMonitor#scanAll] [scanning → degraded] ${provider.key}`, { error });
          return [] as AgentSession[];
        }
      })
    );
    // // --- end GATHER_PROVIDER_SCANS

    // // --- FLATTEN_AND_SORT — invariant: sort by startedAt descending; flat() concatenates all provider results
    const sessions = scans.flat().sort((a, b) => b.startedAt - a.startedAt);
    // // --- end FLATTEN_AND_SORT

    logger.info(`[AgentMonitor#scanAll] [scanning → completed] sessions=${sessions.length}`);
    return sessions;
  }

  /**
   * @purpose Scan a single provider by key; rejects when the provider is not registered.
   * @param key Registered provider key.
   * @param [opts] Optional scan filtering.
   * @throws {ProviderNotFoundError} When the key is not registered.
   * @returns Sessions from the specified provider.
   * @sideEffect Calls the provider's scan() — may read filesystem / database.
   */
  async scanOne(key: string, opts?: ScanOpts): Promise<AgentSession[]> {
    logger.debug(`[AgentMonitor#scanOne] [idle → scanning] ${key}`);

    // // --- ENSURE_PROVIDER_EXISTS — invariant: unknown key is a contract violation → ProviderNotFoundError
    const provider = this._providers.get(key);
    if (provider === undefined) {
      throw new ProviderNotFoundError(key);
    }
    // // --- end ENSURE_PROVIDER_EXISTS

    try {
      const sessions = await provider.scan(opts);
      logger.info(
        `[AgentMonitor#scanOne] [scanning → completed] ${key} sessions=${sessions.length}`
      );
      return sessions;
    } catch (cause) {
      const error = new Error(`[AgentMonitor#scanOne] Provider ${key} failed`, { cause });
      logger.error(`[AgentMonitor#scanOne] [scanning → failed] ${key}`, { error });
      throw error;
    }
  }
}
