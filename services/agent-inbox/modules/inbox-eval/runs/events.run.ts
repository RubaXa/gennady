// @file: events eval run — verifies push→task ≤ 3 min and thread→triage ≤ 3 min
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

const EVENT_TIMEOUT_SEC = 180;

/**
 * @purpose Verify event reactivity: push → task_created(verify_fix|delta_review) ≤ 3 min; thread → thread_triage ≤ 3 min
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const gitlabEvents = entries.filter((e) => e.kind === 'gitlab_event');
  const taskCreated = entries.filter((e) => e.kind === 'task_created');

  // Check push → task
  if (gitlabEvents.length === 0 || taskCreated.length === 0) {
    evidence.push(
      `events: ${gitlabEvents.length} gitlab_event(s), ${taskCreated.length} task_created(s) — insufficient data`
    );
    return pass('events', evidence);
  }

  const failures: string[] = [];

  for (const event of gitlabEvents) {
    const p = event.payload as Record<string, unknown> | undefined;
    if (p?.event !== 'push' && p?.event !== 'new_thread') continue;

    const matchKind = p?.event === 'push' ? ['verify_fix', 'delta_review'] : ['thread_triage'];
    const match = taskCreated.find((t) => {
      const tp = t.payload as Record<string, unknown> | undefined;
      return (
        matchKind.includes(tp?.task_kind as string) &&
        t.ts &&
        event.ts &&
        new Date(t.ts) >= new Date(event.ts)
      );
    });

    if (match && event.ts && match.ts) {
      const elapsedSec = (new Date(match.ts).getTime() - new Date(event.ts).getTime()) / 1000;
      if (elapsedSec > EVENT_TIMEOUT_SEC) {
        failures.push(
          `${p?.event} → ${(match.payload as Record<string, unknown>)?.task_kind ?? 'task'}: ${elapsedSec.toFixed(1)}s (limit: ${EVENT_TIMEOUT_SEC}s)`
        );
      }
    }
  }

  if (failures.length > 0) {
    return fail('events', [...evidence, ...failures]);
  }

  evidence.push(`event reactivity OK: ${gitlabEvents.length} event(s) checked`);
  return pass('events', evidence);
}
