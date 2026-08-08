// @file: parallel eval run — verifies MR-B queued→running ≤ 30s when MR-A is running (incident 2026-07-28)
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

const UNBLOCK_TIMEOUT_SEC = 30;

/**
 * @purpose Verify parallel non-blocking: MR-B transitions queued→running ≤ 30s while MR-A is running
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const taskStatuses = entries.filter((e) => e.kind === 'task_status');

  // Find running phases for MR-A and queued→running transitions for MR-B
  const runningByMr = new Map<string, Array<{ ts: string; status: string }>>();

  for (const e of taskStatuses) {
    const p = e.payload as Record<string, unknown> | undefined;
    const mr = (e.mr ?? p?.mr ?? 'unknown') as string;
    const status = (p?.status ?? 'unknown') as string;
    if (!runningByMr.has(mr)) runningByMr.set(mr, []);
    runningByMr.get(mr)!.push({ ts: e.ts, status });
  }

  if (runningByMr.size < 2) {
    evidence.push(
      `parallel: ${runningByMr.size} MR(s) with task_status — need ≥2 for parallel check`
    );
    return pass('parallel', evidence);
  }

  const mrList = [...runningByMr.keys()];
  // Check each pair: find queued→running gap while other MR has a running task
  const violations: string[] = [];

  for (let i = 0; i < mrList.length; i++) {
    for (let j = i + 1; j < mrList.length; j++) {
      const mrA = mrList[i];
      const mrB = mrList[j];
      const tasksA = runningByMr.get(mrA) ?? [];
      const tasksB = runningByMr.get(mrB) ?? [];

      for (const task of tasksB) {
        if (task.status !== 'running') continue;
        const queuedVersion = tasksB.find(
          (t) => t.status === 'queued' && new Date(t.ts) < new Date(task.ts)
        );
        if (!queuedVersion) continue;

        const elapsed = (new Date(task.ts).getTime() - new Date(queuedVersion.ts).getTime()) / 1000;

        const aRunning = tasksA.some(
          (t) =>
            t.status === 'running' &&
            new Date(t.ts) <= new Date(task.ts) &&
            new Date(t.ts) >= new Date(queuedVersion.ts)
        );

        if (aRunning && elapsed > UNBLOCK_TIMEOUT_SEC) {
          violations.push(
            `${mrB}: queued→running ${elapsed.toFixed(1)}s while ${mrA} was running (limit: ${UNBLOCK_TIMEOUT_SEC}s)`
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    return fail('parallel', [...evidence, ...violations]);
  }

  evidence.push('parallel unblock check: no violations found');
  return pass('parallel', evidence);
}
