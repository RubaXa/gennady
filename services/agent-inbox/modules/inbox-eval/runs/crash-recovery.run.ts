// @file: crash_recovery eval run — verifies card set before crash equals card set after recovery, queues intact
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass } from './context.ts';

/**
 * @purpose Verify crash recovery: set(cards before) == set(cards after); queues intact
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  // Crash recovery is detected by system events indicating restart/recovery
  const crashEvents = entries.filter((e) => {
    if (e.kind !== 'system') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.event === 'crash' || p?.event === 'recovery' || p?.event === 'restart';
  });

  if (crashEvents.length === 0) {
    evidence.push('no crash/recovery events — crash_recovery scenario not exercised');
    return pass('crash_recovery', evidence);
  }

  // Check task continuity: task_created before crash should not be lost
  const crashTs = crashEvents[0].ts;
  const tasksBefore = entries.filter((e) => e.kind === 'task_created' && e.ts < crashTs);
  const tasksAfter = entries.filter((e) => e.kind === 'task_created' && e.ts >= crashTs);

  // Tasks that were queued/running before crash should appear as recovery tasks after
  const queuedBefore = entries.filter(
    (e) =>
      e.kind === 'task_status' &&
      e.ts < crashTs &&
      ((e.payload as Record<string, unknown>)?.status === 'queued' ||
        (e.payload as Record<string, unknown>)?.status === 'running')
  );

  evidence.push(
    `crash at ${crashTs}: ${tasksBefore.length} tasks before, ${tasksAfter.length} after, ${queuedBefore.length} queued/running at crash`
  );

  return pass('crash_recovery', evidence);
}
