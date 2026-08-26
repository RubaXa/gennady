// @file: Posting-effects dispatch owned by PipelineRuntime — reads canonical review.json findings
//   and posts each through the permission-gated Effects layer, degrading to a no-op artifact when
//   there is nothing to post or no coordinator is wired.
// @consumers: pipeline-runtime.ts
// @tasks: N/A

import { logger } from '#logger';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { TaskInstance } from '../../inbox-queue/task-registry.ts';
import type { ReviewEffectCoordinator } from '../../inbox-queue/effects/review-effect-coordinator.ts';
import { writeArtifact, reportRef } from './artifact-io.ts';
import { formatFindingComment } from './report-renderer.ts';

/**
 * @purpose Execute the operator's "post findings" effect: read canonical `review.json` findings
 *   and post each as a top-level 🤖 comment through the permission-gated Effects layer.
 * @invariant Missing coordinator or findings yields a no-op artifact without crashing the drain loop.
 * @param task Queue effect node (`effect` | `post_findings`).
 * @param reportDir Canonical per-MR report directory.
 * @param deps Injected effect coordinator (may be absent) and transition journal.
 * @returns Completion after every finding is posted or degraded.
 * @sideEffect One GitLab comment per finding; writes `effect.result.json` + a feed widget event.
 */
export async function dispatchPostingEffects(
  task: TaskInstance,
  reportDir: string,
  deps: { coordinator: ReviewEffectCoordinator | null | undefined; journal: JournalPort }
): Promise<void> {
  const mr = typeof task.params.mr === 'string' ? task.params.mr : '';
  const mrRef = reportRef(mr);
  const coordinator = deps.coordinator;

  let findings: Array<Record<string, unknown>> = [];
  try {
    const raw = await readFile(join(reportDir, 'review.json'), 'utf8');
    const review = JSON.parse(raw) as { findings?: Array<Record<string, unknown>> };
    findings = Array.isArray(review.findings) ? review.findings : [];
  } catch (cause) {
    logger.warn('[PipelineRuntime#_dispatchPostingEffects] [reading → no_findings]', {
      mr,
      reportDir,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const outcomes: Array<Record<string, unknown>> = [];

  if (findings.length === 0 || !coordinator) {
    await writeArtifact(reportDir, 'effect.result.json', {
      taskId: task.taskId,
      type: task.type,
      mr: mrRef,
      status: 'completed',
      reason: findings.length === 0 ? 'no_findings' : 'coordinator_unavailable',
      outcomes,
    });
    return;
  }

  for (const finding of findings) {
    const body = formatFindingComment(finding);
    try {
      const outcome = await coordinator.postComment(mrRef, body);
      outcomes.push({ id: finding.id, status: outcome.status, evidence: outcome.evidence });
      logger.info('[PipelineRuntime#_dispatchPostingEffects] [posting → outcome]', {
        mr: mrRef,
        findingId: finding.id,
        status: outcome.status,
      });
    } catch (cause) {
      outcomes.push({
        id: finding.id,
        status: 'failed',
        error: cause instanceof Error ? cause.message : String(cause),
      });
      logger.error('[PipelineRuntime#_dispatchPostingEffects] [posting → failed]', {
        mr: mrRef,
        findingId: finding.id,
        error: cause,
      });
    }
  }

  const postedCount = outcomes.filter((o) => o.status === 'applied').length;
  await writeArtifact(reportDir, 'effect.result.json', {
    taskId: task.taskId,
    type: task.type,
    mr: mrRef,
    status: 'completed',
    posted: postedCount,
    outcomes,
  });

  await deps.journal.append({
    ts: new Date().toISOString(),
    mr: mrRef,
    kind: 'widget_bump',
    actor: 'pipeline',
    payload: { event: 'findings_posted', posted: postedCount, total: findings.length },
  });
}
