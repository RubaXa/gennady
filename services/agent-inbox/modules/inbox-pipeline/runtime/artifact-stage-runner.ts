// @file: Deterministic production stage dispatcher owned by PipelineRuntime — emits the durable
//   per-stage artifacts (environment/plan/enrich/track/lens/coverage/synthesis/verdict/tail/effect)
//   promised by the pipeline contract when no role-specific runner is injected.
// @consumers: pipeline-runtime.ts
// @tasks: N/A

import { logger } from '#logger';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { FindingsJournal } from '../findings-journal.ts';
import { GateVerdict, type ReviewJson } from '../gate-verdict.ts';
import { LensRegistry } from '../lens-registry.ts';
import { PlanTemplate, type ChangesetEntry, type ReviewPlan } from '../plan-template.ts';
import { Synthesize, type ModelResult } from '../synthesize.ts';
import { TriggerRegistry } from '../trigger-registry.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { ProposalRecord } from '../../inbox-core/decision-journal.ts';
import type { TaskInstance } from '../../inbox-queue/task-registry.ts';
import {
  writeArtifact,
  writeArtifactBytes,
  reportRef,
  normalizeTaskSuffix,
  readWorkerResults,
} from './artifact-io.ts';
import { renderWorkerReport, renderSynthesisReport } from './report-renderer.ts';
import type { PipelineTaskRunner, PipelineProposalSink } from './pipeline-runtime.types.ts';

/** @purpose Injected dependencies for the deterministic per-stage artifact runner. */
export type ArtifactRunnerDeps = {
  /**
   * @purpose Execute a concrete fan-out node through the injected OpenCode production seam.
   * @param task Materialized track or lens queue instance.
   * @param reportDir Durable report directory used as the worker session root.
   * @param files Changed files assigned to this worker.
   * @returns Validated model result with factual session identity.
   */
  runWorker: (task: TaskInstance, reportDir: string, files: string[]) => Promise<ModelResult>;
  /**
   * @purpose Recover factual coverage through a retained worker session, escalating when incomplete.
   * @param task Coverage queue node containing MR and original trace input.
   * @param reportDir Durable report root.
   * @param changeset Changed files forming the must-read checklist.
   * @returns Promise resolving when coverage passes; rejects only after durable escalation is recorded.
   */
  runCoverageGate: (
    task: TaskInstance,
    reportDir: string,
    changeset: ChangesetEntry[]
  ) => Promise<void>;
  /**
   * @purpose Execute the operator's "post findings" effect through the permission-gated Effects layer.
   * @param task Queue effect node (`effect` | `post_findings`).
   * @param reportDir Canonical per-MR report directory.
   * @returns Completion after every finding is posted or degraded.
   */
  dispatchPostingEffects: (task: TaskInstance, reportDir: string) => Promise<void>;
  /** @purpose Production decision journal sink; absent only in isolated deterministic tests. */
  proposalSink: PipelineProposalSink | undefined;
  /** @purpose Transition journal; production receives EventJournal while pure tests use VolatileJournal. */
  journal: JournalPort;
};

/**
 * @purpose Read the materialized deterministic plan from task parameters or reconstruct it.
 * @param task Queue node carrying persisted plan input.
 * @param mr MR reference used when a recovered legacy node needs reconstruction.
 * @returns Deterministic review plan for this task's MR.
 */
export function taskPlan(task: TaskInstance, mr: string): ReviewPlan {
  const candidate = task.params.plan;
  if (candidate && typeof candidate === 'object') return candidate as ReviewPlan;
  return new PlanTemplate(new TriggerRegistry()).generate(mr, taskChangeset(task));
}

/**
 * @purpose Narrow externally persisted params to valid changeset entries.
 * @param task Queue node carrying persisted changeset input.
 * @returns Valid changeset entries only.
 */
export function taskChangeset(task: TaskInstance): ChangesetEntry[] {
  const candidate = task.params.changeset;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (entry): entry is ChangesetEntry =>
      !!entry &&
      typeof entry === 'object' &&
      typeof entry.path === 'string' &&
      (entry.action === 'added' || entry.action === 'modified' || entry.action === 'deleted')
  );
}

/**
 * @purpose Build the deterministic production stage dispatcher used when no role-specific runner is injected.
 * @param stateDir State root owning per-MR reports.
 * @param deps Injected worker/coverage/effect seams, proposal sink and transition journal.
 * @returns Stage runner that emits the durable artifacts promised by the pipeline contract.
 */
export function createArtifactRunner(
  stateDir: string | undefined,
  deps: ArtifactRunnerDeps
): PipelineTaskRunner {
  if (!stateDir) {
    return async () => {
      throw new Error('[PipelineRuntime] Production stage runner requires stateDir');
    };
  }
  return async (task) => {
    const mr = typeof task.params.mr === 'string' ? task.params.mr : '';
    const reportDir = mrReportsDir(stateDir, reportRef(mr));
    const tasksDir = join(reportDir, 'tasks');
    await mkdir(tasksDir, { recursive: true });
    const plan = taskPlan(task, mr);
    const changeset = taskChangeset(task);

    if (task.type === 'prepare_env' || task.type === 'delta_prepare') {
      await writeArtifact(reportDir, 'environment.json', {
        mr,
        taskId: task.taskId,
        stage: task.type,
        preparedAt: new Date().toISOString(),
      });
      return;
    }
    if (task.type === 'plan') {
      const planText = plan.tracks
        .map(
          (track) => `- [ ] ${track.source}: ${track.id} — ${track.files.join(', ') || 'no files'}`
        )
        .join('\n');
      await writeFile(
        join(reportDir, 'PLAN.md'),
        `---\nmr: ${mr}\n---\n\n# План ревью\n\n${planText}\n`,
        'utf8'
      );
      await writeArtifact(reportDir, 'plan.json', plan as unknown as Record<string, unknown>);
      return;
    }
    if (task.type === 'enrich') {
      const lenses = new LensRegistry().resolveAll(plan.tracks.map((track) => track.id));
      await writeArtifact(reportDir, 'enrich.json', {
        mr,
        mandatoryWaves: lenses.mandatoryWaves,
        proposedLenses: lenses.proposedLenses,
      });
      return;
    }
    if (
      task.type.startsWith('track_') ||
      task.type.startsWith('lens_') ||
      task.type === 'delta_tracks'
    ) {
      const files = task.type.startsWith('track_')
        ? (plan.tracks.find(
            (track) => normalizeTaskSuffix(track.id) === task.type.slice('track_'.length)
          )?.files ?? [])
        : changeset.map((entry) => entry.path);
      const modelResult = await deps.runWorker(task, reportDir, files);
      await writeArtifact(tasksDir, `${task.type}.result.json`, {
        taskId: task.taskId,
        type: task.type,
        mr,
        status: files.length > 0 ? 'reviewed' : 'no_applicable_files',
        files,
        findings: modelResult.findings,
        diagrams: modelResult.diagrams ?? [],
        model: modelResult.model,
        runId: modelResult.runId,
      });
      await writeArtifactBytes(
        reportDir,
        `tasks/${task.type}.md`,
        modelResult.report ?? renderWorkerReport(task.type, files, modelResult.findings)
      );
      await writeArtifact(tasksDir, `${task.type}.${modelResult.model}.result.json`, modelResult);
      return;
    }
    if (task.type === 'gate_coverage') {
      await deps.runCoverageGate(task, reportDir, changeset);
      return;
    }
    if (task.type === 'synthesize' || task.type === 'synthesize_delta') {
      const findingsJournal = new FindingsJournal(join(reportDir, 'findings.jsonl'));
      const synthesize = new Synthesize(findingsJournal);
      const modelResults = await readWorkerResults(tasksDir);
      const seededResults = Array.isArray(task.params.modelResults)
        ? (task.params.modelResults as ModelResult[])
        : [];
      const synthesized = await synthesize.synthesize(
        modelResults.length > 0 ? modelResults : seededResults
      );
      const review: ReviewJson = {
        ...(synthesize.buildReviewJson(
          synthesized,
          modelResults.length > 0 ? modelResults : seededResults
        ) as ReviewJson),
        verdict: 'COMMENT',
      };
      await writeArtifact(reportDir, 'review.json', review);
      await writeArtifactBytes(
        reportDir,
        'REVIEW.md',
        renderSynthesisReport(review, modelResults.length > 0 ? modelResults : seededResults)
      );
      // Публикуем итог ревью в ленту: без widget_bump feed состоит из одних progress-записей,
      // и оператор не видит, что ревью вообще состоялось (live-дефект приёмки S3).
      await deps.journal.append({
        ts: new Date().toISOString(),
        mr,
        kind: 'widget_bump',
        actor: 'pipeline',
        payload: {
          verdict: review.verdict ?? 'COMMENT',
          revision: review.revision ?? 1,
          items: (review.findings ?? []).map((finding) => ({
            id: finding.id,
            severity: finding.severity,
            file: finding.file ?? '',
            line: finding.line ?? 0,
            summary: finding.summary ?? '',
            state: 'open',
            diff: finding.diff ?? [],
            factcheck: finding.factcheck ?? 'pending',
          })),
        },
      });
      return;
    }
    if (task.type.startsWith('gate_verdict')) {
      const review = JSON.parse(
        await import('node:fs/promises').then(({ readFile }) =>
          readFile(join(reportDir, 'review.json'), 'utf8')
        )
      ) as ReviewJson;
      const result = new GateVerdict().validate(review);
      await writeArtifact(reportDir, 'verdict.json', {
        mr,
        ...result,
        verdict: review.verdict,
      });
      if (result.status === 'fail')
        throw new Error(`Review verdict invalid: ${result.reasons.join('; ')}`);
      return;
    }
    if (task.type.startsWith('tail_')) {
      if (task.type === 'tail_reviewer' && deps.proposalSink && mr) {
        const proposal: ProposalRecord = {
          proposalId: `pipeline:${task.taskId}:post_findings`,
          capability: 'post_findings',
          mr,
          payload: { reviewArtifact: 'review.json', taskId: task.taskId },
          producedBy: { sessionId: `pipeline:${task.taskId}`, taskId: task.taskId },
        };
        await deps.proposalSink(proposal);
        logger.info('[PipelineRuntime#_createArtifactRunner] [tail → proposal_persisted]', {
          mr,
          proposalId: proposal.proposalId,
        });
      }
      await writeArtifact(reportDir, `${task.type}.json`, {
        mr,
        taskId: task.taskId,
        status: 'completed',
      });
      return;
    }
    if (task.type === 'effect' || task.type === 'post_findings') {
      await deps.dispatchPostingEffects(task, reportDir);
      return;
    }
    await writeArtifact(tasksDir, `${task.type}.result.json`, {
      taskId: task.taskId,
      type: task.type,
      mr,
      status: 'completed',
    });
  };
}
