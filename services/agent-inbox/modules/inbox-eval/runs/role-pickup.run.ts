// @file: role_pickup eval run — verifies task_created for pipeline-task and zero manual acts
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

/**
 * @purpose Verify role pickup: task_created pipeline-task exists; zero manual acts in journal
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const pipelineTasks = entries.filter((e) => {
    if (e.kind !== 'task_created') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.task_kind === 'pipeline' || p?.kind === 'pipeline';
  });

  if (pipelineTasks.length === 0) {
    return fail('role_pickup', ['no pipeline-task task_created event found']);
  }
  evidence.push(`pipeline-task created: ${pipelineTasks.length} event(s)`);

  const manualActs = entries.filter((e) => e.actor === 'operator' || e.actor === 'manual');
  if (manualActs.length > 0) {
    return fail('role_pickup', [
      ...evidence,
      `found ${manualActs.length} manual act(s) — expected zero`,
    ]);
  }
  evidence.push('zero manual acts confirmed');

  return pass('role_pickup', evidence);
}
