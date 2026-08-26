// @file: Factual coverage gate owned by PipelineRuntime — recovers coverage through retained
//   worker sessions, escalates to the operator when it remains incomplete, and releases the
//   sessions once the gate resolves.
// @consumers: pipeline-runtime.ts
// @tasks: N/A

import { logger } from '#logger';
import { CoverageGate, type ToolTrace } from '../coverage-gate.ts';
import type { ChangesetEntry } from '../plan-template.ts';
import type { TaskInstance } from '../../inbox-queue/task-registry.ts';
import type { OpenCodePort } from '../../inbox-opencode/opencode.port.ts';
import { writeArtifact, appendToolTrace, readToolTrace } from './artifact-io.ts';
import type { PipelineWorkerSession } from './pipeline-runtime.types.ts';

/** @purpose Shared coverage-gate state: per-MR retained worker sessions and the AI seam. */
export type CoverageDeps = {
  /** @purpose Per-MR live worker sessions; coverage must continue one of these, never replace it. */
  sessions: Map<string, PipelineWorkerSession[]>;
  /** @purpose Production AI seam used by fan-out workers; absent only for deterministic/unit runtimes. */
  opencode: OpenCodePort | undefined;
};

/**
 * @purpose Recover factual coverage through a retained worker session, then write an explicit operator escalation when it remains incomplete.
 * @invariant At most two continuations use the same session id; all retained sessions close only after this gate resolves.
 * @param task Coverage queue node containing MR and original trace input.
 * @param reportDir Durable report root.
 * @param changeset Changed files forming the must-read checklist.
 * @param deps Injected worker-session map and AI seam.
 * @returns Promise resolving when coverage passes; rejects only after durable escalation is recorded.
 */
export async function runCoverageGate(
  task: TaskInstance,
  reportDir: string,
  changeset: ChangesetEntry[],
  deps: CoverageDeps
): Promise<void> {
  const mr = String(task.params.mr);
  const checklist = changeset.map((entry) => entry.path);
  const deletedFiles = changeset
    .filter((entry) => entry.action === 'deleted')
    .map((entry) => entry.path);
  const liveTrace = await readToolTrace(reportDir);
  const initialTrace =
    liveTrace.length > 0 ? liveTrace : ((task.params.toolTrace as ToolTrace[] | undefined) ?? []);
  const gate = new CoverageGate();
  try {
    const coverage = await gate.recoverWithContinue(
      checklist,
      initialTrace,
      async (missingFiles, attempt) =>
        continueCoverageWorker(mr, reportDir, missingFiles, attempt, deps),
      deletedFiles
    );
    await writeArtifact(reportDir, 'coverage.json', coverage as unknown as Record<string, unknown>);
  } catch (cause) {
    const coverage = gate.check(checklist, await readToolTrace(reportDir), deletedFiles);
    await writeArtifact(reportDir, 'coverage.json', coverage as unknown as Record<string, unknown>);
    await writeArtifact(reportDir, 'operator-escalation.json', {
      kind: 'coverage_incomplete',
      mr,
      taskId: task.taskId,
      missingFiles: coverage.missingFiles,
      continueCount: coverage.continueCount,
      outcome: 'operator_action_required',
    });
    logger.error('[PipelineRuntime#_runCoverageGate] [coverage → operator_escalation]', {
      mr,
      missingFiles: coverage.missingFiles,
      continueCount: coverage.continueCount,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
    throw new Error(
      `[PipelineRuntime#_runCoverageGate] Coverage incomplete; operator action required for ${coverage.missingFiles.join(', ')}`,
      { cause: cause instanceof Error ? cause : undefined }
    );
  } finally {
    await closeWorkerSessions(mr, deps);
  }
}

/**
 * @purpose Ask one retained worker to read the missing files without discarding its session context.
 * @param mr MR whose active workers own the accumulated tool trace.
 * @param reportDir Durable report root receiving factual continuation telemetry.
 * @param missingFiles Files the gate still requires.
 * @param attempt One-based continuation attempt.
 * @param deps Injected worker-session map and AI seam.
 * @returns Entire factual trace after this same-session continuation turn.
 */
export async function continueCoverageWorker(
  mr: string,
  reportDir: string,
  missingFiles: string[],
  attempt: number,
  deps: CoverageDeps
): Promise<ToolTrace[]> {
  const worker = deps.sessions.get(mr)?.at(-1);
  if (!worker || !deps.opencode) return readToolTrace(reportDir);
  const response = await deps.opencode.continueSignal(worker.sid, {
    system: 'Continue the existing review session. Read every missing file before responding.',
    text: `Coverage continuation ${attempt}/2. Read: ${missingFiles.join(', ')}`,
  });
  if (!response.ok) {
    logger.warn('[PipelineRuntime#_continueCoverageWorker] [continuing → incomplete]', {
      mr,
      sid: worker.sid,
      attempt,
      errorClass: response.error.class,
    });
  }
  await appendToolTrace(reportDir, await deps.opencode.toolCalls(worker.sid));
  return readToolTrace(reportDir);
}

/**
 * @purpose Retain a successful worker session until the downstream coverage gate consumes it.
 * @param mr MR partition that owns the worker session.
 * @param session OpenCode identity and source fan-out node.
 * @param sessions Shared per-MR worker-session map to mutate.
 */
export function rememberWorkerSession(
  mr: string,
  session: PipelineWorkerSession,
  sessions: Map<string, PipelineWorkerSession[]>
): void {
  const existing = sessions.get(mr) ?? [];
  existing.push(session);
  sessions.set(mr, existing);
}

/**
 * @purpose Close retained worker sessions after coverage terminally passes or escalates.
 * @param mr MR partition whose sessions must be released.
 * @param deps Injected worker-session map and AI seam.
 * @returns Promise resolved once every retained session has been closed.
 */
export async function closeWorkerSessions(mr: string, deps: CoverageDeps): Promise<void> {
  const sessions = deps.sessions.get(mr) ?? [];
  deps.sessions.delete(mr);
  if (!deps.opencode) return;
  await Promise.all(sessions.map((session) => deps.opencode!.close(session.sid)));
}
