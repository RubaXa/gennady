// @file: Async iterable for continuous session change observation
// @consumers: CLI
// @tasks: TSK-38

import { logger } from '#logger';
import type { AgentMonitor } from '../monitor/agent-monitor.ts';
import type { AgentSession } from '../model/agent-session.type.js';
import type { ObserveOpts } from '../model/observe-opts.type.js';
import type { SessionChanges } from '../model/session-changes.type.js';
import { diff } from '../diff/diff.ts';

/** @purpose Default idle threshold in milliseconds — 5 minutes. */
const DEFAULT_IDLE_THRESHOLD_MS = 300_000;

/** @purpose Minimum allowed polling interval to prevent resource spam. */
const MIN_INTERVAL_MS = 100;

// #region START_IDLE_DETECTION_HELPERS

/**
 * @purpose Apply idle detection — sessions inactive beyond idleThresholdMs get status 'idle'.
 * @param sessions Sessions to evaluate for idle status.
 * @param idleThresholdMs Idle threshold in milliseconds.
 * @sideEffect Mutates session.status for sessions exceeding the idle threshold.
 */
function applyIdleDetection(sessions: AgentSession[], idleThresholdMs: number): void {
  const now = Date.now();
  for (const session of sessions) {
    // #region START_DETECT_IDLE — invariant: session without lastActivityAt is never idle; status set only when threshold exceeded
    if (session.lastActivityAt !== undefined && (now - session.lastActivityAt) > idleThresholdMs) {
      session.status = 'idle';
    }
    // #endregion END_DETECT_IDLE
  }
}

/**
 * @purpose Produce an empty SessionChanges — all three arrays empty.
 * @returns Empty SessionChanges.
 */
function emptyChanges(): SessionChanges {
  return { added: [], removed: [], updated: [] };
}

// #endregion END_IDLE_DETECTION_HELPERS

/**
 * @purpose Continuous async iterable yielding session changes at a configurable interval.
 * @param monitor AgentMonitor instance with registered providers — used for scanAll() each cycle.
 * @param opts Observation options: interval (≥100ms), idleThresholdMs (default 300000).
 * @throws {RangeError} When opts.interval &lt; 100 — contract violation per DbC.
 * @returns AsyncIterable yielding SessionChanges after each poll cycle; first iteration establishes baseline and does NOT yield.
 * @sideEffect Polling: calls monitor.scanAll() per cycle; uses setTimeout for non-blocking delay.
 */
export async function* observe(
  monitor: AgentMonitor,
  opts: ObserveOpts
): AsyncIterable<SessionChanges> {
  // #region START_VALIDATE_INTERVAL — invariant: interval below minimum is a DbC contract violation
  if (opts.interval < MIN_INTERVAL_MS) {
    throw new RangeError(
      `[observe] interval must be >= ${MIN_INTERVAL_MS}ms, got ${opts.interval}`
    );
  }
  // #endregion END_VALIDATE_INTERVAL

  const idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;

  logger.debug(
    `[observe] [idle → initializing] interval=${opts.interval}ms idleThreshold=${idleThresholdMs}ms`
  );

  // #region START_BASELINE_SCAN — invariant: first scanAll result is baseline, never yielded; scan failure yields empty baseline
  let prev: AgentSession[];
  try {
    prev = await monitor.scanAll();
    applyIdleDetection(prev, idleThresholdMs);
    logger.debug(`[observe] [initializing → baseline] sessions=${prev.length}`);
  } catch (cause) {
    const error = new Error('[observe] Baseline scan failed', { cause });
    logger.error(`[observe] [initializing → failed]`, { error });
    prev = [];
  }
  // #endregion END_BASELINE_SCAN

  // #region START_POLLING_LOOP — invariant: infinite loop, terminated by external break; errors degrade to empty yield, never abort
  while (true) {
    // #region START_POLL_INTERVAL — invariant: setTimeout-based non-blocking delay preserves event loop
    await new Promise<void>(resolve => setTimeout(resolve, opts.interval));
    // #endregion END_POLL_INTERVAL

    // #region START_SCAN_CYCLE — invariant: scan → idle detection → diff → yield; scan failure yields empty SessionChanges
    try {
      const curr = await monitor.scanAll();
      applyIdleDetection(curr, idleThresholdMs);

      const changes = diff(prev, curr);

      logger.debug(
        `[observe] [polling → yielded] added=${changes.added.length} removed=${changes.removed.length} updated=${changes.updated.length}`
      );

      prev = curr;
      yield changes;
    } catch (cause) {
      const error = new Error('[observe] Scan cycle failed', { cause });
      logger.error(`[observe] [polling → degraded]`, { error });
      yield emptyChanges();
    }
    // #endregion END_SCAN_CYCLE
  }
  // #endregion END_POLLING_LOOP
}
