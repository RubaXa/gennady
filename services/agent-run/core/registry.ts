// @file: Engine registry — registration, default resolution, and cached detect for listEngines.
// @consumers: run, listEngines, index.ts (composition root)
// @tasks: TSK-62

import { logger } from '#logger';
import { AgentRunError } from './agent-run-error.ts';
import type { AgentEngine } from './ports/agent-engine.port.ts';
import type { EngineStatus } from './run-options.type.ts';

// purpose: process-lifetime cache for detect() results — populated on first listEngines() call
// invariant: cache is never cleared during process lifetime; repeated listEngines() reads from cache
const _detectCache = new Map<string, EngineStatus>();

// purpose: ordered list of registered engines; insertion order determines the default (first = default)
const _engines: AgentEngine[] = [];

/**
 * @purpose Register an engine adapter in the process-lifetime registry.
 * @param engine Adapter implementing the `AgentEngine` contract.
 * @post Engine is appended to the registry; the first registered engine becomes the default.
 */
export function register(engine: AgentEngine): void {
  logger.debug(`[register] [idle → registered] ${engine.id}`);
  _engines.push(engine);
}

/**
 * @purpose Resolve an engine by id or return the default (first registered) without calling `detect()`.
 * @invariant Never calls `detect()` — hot path; optimistic resolution by insertion order or explicit id.
 * @invariant Never returns `undefined`; throws `AgentRunError('AGENT_NOT_INSTALLED')` instead.
 * @param [id] Optional engine id; absent → first registered engine.
 * @throws {AgentRunError} When no engines are registered or the requested id is unknown.
 * @returns The matching `AgentEngine` adapter.
 */
export function resolve(id?: string): AgentEngine {
  // #region START_RESOLVE_BY_ID — non-goal: does NOT call detect(); installed state checked at launch
  if (id !== undefined) {
    const found = _engines.find((e) => e.id === id);
    if (found === undefined) {
      throw new AgentRunError('AGENT_NOT_INSTALLED', `engine "${id}" is not registered`);
    }
    logger.debug(`[resolve] [idle → resolved] ${id}`);
    return found;
  }
  // #endregion END_RESOLVE_BY_ID

  // #region START_RESOLVE_DEFAULT
  const defaultEngine = _engines[0];
  if (defaultEngine === undefined) {
    throw new AgentRunError(
      'AGENT_NOT_INSTALLED',
      'no engines registered; add an engine adapter to the composition root'
    );
  }
  logger.debug(`[resolve] [idle → resolved] default=${defaultEngine.id}`);
  return defaultEngine;
  // #endregion END_RESOLVE_DEFAULT
}

/**
 * @purpose Return all registered engine adapters in insertion order.
 * @returns Snapshot of the registered engine list.
 */
export function list(): AgentEngine[] {
  return [..._engines];
}

/**
 * @purpose Run `detect()` for all registered engines, cache results, and return statuses.
 * @invariant `detect()` is called at most once per engine per process lifetime — results are memoized.
 * @invariant A failing `detect()` yields `installed: false`; the overall call never throws.
 * @returns One `EngineStatus` per registered engine.
 * @sideEffect Spawns `--version` probes for engines not yet in the cache.
 */
export async function detectAll(): Promise<EngineStatus[]> {
  logger.debug(`[detectAll] [idle → probing] engines=${_engines.length}`);

  const statuses: EngineStatus[] = [];

  // #region START_DETECT_WITH_CACHE
  for (const engine of _engines) {
    const cached = _detectCache.get(engine.id);
    if (cached !== undefined) {
      statuses.push(cached);
      continue;
    }

    // #region START_DETECT_GRACEFUL_FALLBACK — failure mode: detect() throws → installed:false, no rethrow
    try {
      const result = await engine.detect();
      const status: EngineStatus = {
        id: engine.id,
        installed: result.installed,
        version: result.version,
      };
      _detectCache.set(engine.id, status);
      statuses.push(status);
    } catch (cause) {
      logger.warn(`[detectAll] [probing → degraded] ${engine.id}`, { cause });
      const status: EngineStatus = { id: engine.id, installed: false };
      _detectCache.set(engine.id, status);
      statuses.push(status);
    }
    // #endregion END_DETECT_GRACEFUL_FALLBACK
  }
  // #endregion END_DETECT_WITH_CACHE

  logger.debug(`[detectAll] [probing → done] engines=${statuses.length}`);
  return statuses;
}

/**
 * @purpose Reset registry and detect cache — for test isolation only.
 * @invariant Must NOT be called in production code; used exclusively in unit tests.
 */
export function _resetForTest(): void {
  _engines.length = 0;
  _detectCache.clear();
}
