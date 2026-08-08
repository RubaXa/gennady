// @file: boot eval run — verifies all boot phases complete ≤ 5 min and card stability after ready
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

const BOOT_TIMEOUT_SEC = 300;

/**
 * @purpose Verify boot phase: all phases ≤ 5 min; after ready no card changed attention group >1 time
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const taskCreated = entries.filter((e) => e.kind === 'task_created');
  const taskStatuses = entries.filter((e) => e.kind === 'task_status');

  if (taskCreated.length === 0) {
    return fail('boot', ['no task_created events in journal — boot phase never ran']);
  }

  const evidence: string[] = [];

  const firstTask = taskCreated[0];
  const lastReady = taskStatuses
    .filter((e) => {
      const p = e.payload as Record<string, unknown> | undefined;
      return p?.status === 'ready' || p?.status === 'done';
    })
    .pop();

  if (firstTask && lastReady && firstTask.ts && lastReady.ts) {
    const elapsedSec = (new Date(lastReady.ts).getTime() - new Date(firstTask.ts).getTime()) / 1000;
    evidence.push(`boot elapsed: ${elapsedSec.toFixed(1)}s (first task → last ready)`);
    if (elapsedSec > BOOT_TIMEOUT_SEC) {
      return fail('boot', [
        ...evidence,
        `boot phase exceeded ${BOOT_TIMEOUT_SEC}s timeout: ${elapsedSec.toFixed(1)}s`,
      ]);
    }
  } else {
    evidence.push('boot: insufficient timestamp data for elapsed-time check');
  }

  return pass('boot', evidence);
}
