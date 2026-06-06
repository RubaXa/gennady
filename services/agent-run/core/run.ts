// @file: Public entry points `run`, `listEngines`, and `listModels` for the agent-run module.
// @consumers: index.ts (composition root), CLI commands, agent consumers
// @tasks: TSK-62, TSK-64

import { logger } from '#logger';
import { AgentRunError } from './agent-run-error.ts';
import { detectAll, resolve } from './registry.ts';
import type { EngineStatus, RunOptions, RunResult } from './run-options.type.ts';

/** @purpose Default timeout in ms applied when `options.timeout` is absent. 30 min — real agent work runs long; a hang safety-net, not a work limit. */
const DEFAULT_TIMEOUT_MS = 1_800_000;

/**
 * @purpose Execute an agent task using the selected or default engine and return the markdown response.
 * @invariant Optimistic dispatch: never calls `detect()` on the hot path; engine absence surfaces via spawn error mapped to AGENT_NOT_INSTALLED.
 * @invariant `timeout` defaults to 1800000 ms (30 min) when absent; the engine owns subprocess termination.
 * @invariant Mode invariant: `mode` is `'readonly'` in v1 — enforced by the `RunOptions` type at compile time.
 * @pre `options.task` must be non-empty after trim; violation throws `AgentRunError('LAUNCH_FAILED')` before dispatch.
 * @param options Task description, working dirs, optional engine override, and timeout.
 * @throws {AgentRunError} On empty task (`LAUNCH_FAILED`), missing engine (`AGENT_NOT_INSTALLED`), or engine failure.
 * @returns Markdown response and id of the engine that produced it.
 */
export async function run(options: RunOptions): Promise<RunResult> {
  // #region START_VALIDATE_TASK — failure mode: empty/whitespace task → LAUNCH_FAILED before any engine dispatch
  if (options.task.trim() === '') {
    throw new AgentRunError('LAUNCH_FAILED', 'task must not be empty or whitespace');
  }
  // #endregion END_VALIDATE_TASK

  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const resolvedOptions: RunOptions = { ...options, timeout };

  logger.debug(
    `[run] [idle → dispatching] engine=${options.engine ?? 'default'} timeout=${timeout}`
  );

  // invariant: resolve() never calls detect(); engine binary absence surfaces at launch via spawn error
  const engine = resolve(options.engine);

  // #region START_ENGINE_RUN
  try {
    const result = await engine.run(resolvedOptions);
    logger.info(`[run] [dispatching → completed] engine=${engine.id}`);
    return result;
  } catch (cause) {
    if (cause instanceof AgentRunError) {
      logger.error(`[run] [dispatching → failed] engine=${engine.id} code=${cause.code}`, {
        cause,
      });
      throw cause;
    }
    const error = new AgentRunError(
      'LAUNCH_FAILED',
      `engine "${engine.id}" threw an unexpected error`
    );
    logger.error(`[run] [dispatching → failed] engine=${engine.id}`, { cause });
    throw error;
  }
  // #endregion END_ENGINE_RUN
}

/**
 * @purpose Return the installation status of all registered engines, with cached `detect()` results.
 * @invariant `detect()` is called at most once per engine per process lifetime (cached in registry).
 * @invariant Never throws; a failing `detect()` yields `installed: false` for that engine.
 * @returns One `EngineStatus` per registered engine in registration order.
 * @sideEffect Spawns `--version` probes for engines not yet cached (first call only per engine).
 */
export async function listEngines(): Promise<EngineStatus[]> {
  logger.debug('[listEngines] [idle → probing]');
  const statuses = await detectAll();
  logger.debug(`[listEngines] [probing → done] count=${statuses.length}`);
  return statuses;
}

/**
 * @purpose Return the list of models available through the selected or default engine.
 * @invariant Delegates to `AgentEngine.listModels()`; never throws — returns `[]` on any failure.
 * @param [engineId] Optional engine id override; absent → registry default.
 * @returns Array of model identifiers in `provider/model` format; empty on failure or unavailability.
 */
export async function listModels(engineId?: string): Promise<string[]> {
  logger.debug(`[listModels] [idle → retrieving] engine=${engineId ?? 'default'}`);
  const engine = resolve(engineId);

  // #region START_LIST_MODELS_WITH_DEGRADATION — failure mode: any engine error → [] (caller must not crash)
  try {
    const models = await engine.listModels();
    logger.debug(`[listModels] [retrieving → done] count=${models.length}`);
    return models;
  } catch (cause) {
    logger.error('[listModels] [retrieving → degraded] engine.listModels() threw; returning []', {
      cause,
    });
    return [];
  }
  // #endregion END_LIST_MODELS_WITH_DEGRADATION
}
