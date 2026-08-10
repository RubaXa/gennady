// @file: PipelineRuntime — boot-owned materializer and executor lifecycle for review/delta DAGs.
// @consumers: agent-inbox serve bootstrap, RoleScheduler
// @tasks: TSK-157, TSK-161, TSK-173

import { logger } from '#logger';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { CoverageGate, type ToolTrace } from './coverage-gate.ts';
import { FindingsJournal } from './findings-journal.ts';
import { GateVerdict, type ReviewJson } from './gate-verdict.ts';
import { LensRegistry } from './lens-registry.ts';
import { PlanTemplate, type ChangesetEntry, type ReviewPlan } from './plan-template.ts';
import { Synthesize, type ModelResult } from './synthesize.ts';
import { TriggerRegistry } from './trigger-registry.ts';
import type { JournalEntry, JournalPort } from '../inbox-core/event-journal.ts';
import { ReviewEvent } from '../inbox-core/types/review-event.type.ts';
import type { OpenCodePort, ToolCall } from '../inbox-opencode/opencode.port.ts';
import type { ProposalRecord } from '../inbox-core/decision-journal.ts';
import { Executor } from '../inbox-queue/executor.ts';
import { TaskRegistry, type TaskInstance } from '../inbox-queue/task-registry.ts';
import type { TaskQueuePort } from '../inbox-queue/task-queue.ts';

/** @purpose Test-only journal preserving the Executor seam for pure DAG materialization. */
class VolatileJournal implements JournalPort {
  readonly identity = 'volatile-pipeline-journal';
  protected _entries: JournalEntry[] = [];
  protected _reviewEvents: ReviewEvent[] = [];

  health(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  async append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
    const seq = this._entries.length + 1;
    this._entries.push({ ...entry, seq });
    return seq;
  }

  read(): JournalEntry[] {
    return this._entries;
  }

  since(cursor: number) {
    const entries = this._entries.filter((entry) => entry.seq > cursor);
    return { entries, nextCursor: this._entries.at(-1)?.seq ?? cursor };
  }

  async appendReviewEvent(event: ReviewEvent): Promise<number> {
    this._reviewEvents.push(ReviewEvent.validate(event.toJSON()));
    return this._reviewEvents.length;
  }

  replayReviewEvents(): ReviewEvent[] {
    return this._reviewEvents.map((event) => ReviewEvent.validate(event.toJSON()));
  }
}

/** @purpose Role tail selected after the common review DAG finishes. */
export type PipelineRole = 'author' | 'reviewer';

/** @purpose Optional materialization details supplied by the production role scheduler. */
export type ReviewStartOptions = {
  /** @purpose Review role determining the terminal tail. */
  role?: PipelineRole;
  /** @purpose Mandatory/triggered track ids from the deterministic plan. */
  tracks?: string[];
  /** @purpose Real changed files collected by the role context; empty means pipeline cannot claim coverage. */
  changeset?: ChangesetEntry[];
  /** @purpose Tool reads performed by the review workers, consumed by CoverageGate. */
  toolTrace?: ToolTrace[];
  /** @purpose Raw worker/model results, synthesized into the canonical review rather than replaced by a placeholder. */
  modelResults?: ModelResult[];
};

/** @purpose Hook that executes one queue lifecycle node after Executor marks it running. */
export type PipelineTaskRunner = (task: TaskInstance) => Promise<void>;
/** @purpose Durable production seam for an operator-visible proposal emitted by a pipeline tail. */
export type PipelineProposalSink = (proposal: ProposalRecord) => Promise<void>;

/** @purpose Live worker session retained until CoverageGate has either recovered or escalated. */
type PipelineWorkerSession = {
  /** @purpose OpenCode session that owns the worker's already-read context. */
  sid: string;
  /** @purpose Concrete fan-out node that created the session. */
  taskType: string;
};

/** @purpose Queue-backed production lifecycle for deterministic pipeline DAG materialization. */
export class PipelineRuntime {
  /** @purpose The boot-owned queue used by API, scheduler and lifecycle. */
  protected _queue: TaskQueuePort;
  /** @purpose Immutable policy registry shared by every per-MR executor. */
  protected _registry: TaskRegistry;
  /** @purpose Transition journal; production receives EventJournal while pure tests use VolatileJournal. */
  protected _journal: JournalPort;
  /** @purpose Whether the supplied journal survives process restart and can drive the boot drainer. */
  protected _durable: boolean;
  /** @purpose One Executor per MR, created lazily on first queue submission. */
  protected _executors = new Map<string, Executor>();
  /** @purpose Queue-node runner; role graphs own substantive review work, this owns progression. */
  protected _runner: PipelineTaskRunner;
  /** @purpose Interval handle for the boot lifecycle. */
  protected _timer: NodeJS.Timeout | null = null;
  /** @purpose In-flight drain guard — interval ticks never advance the same queue concurrently. */
  protected _draining: Promise<void> | null = null;
  /** @purpose Production AI seam used by fan-out workers; absent only for deterministic/unit runtimes. */
  protected _opencode: OpenCodePort | undefined;
  /** @purpose Per-MR live worker sessions; coverage must continue one of these, never replace it. */
  protected _workerSessions = new Map<string, PipelineWorkerSession[]>();
  /** @purpose Production decision journal sink; absent only in isolated deterministic tests. */
  protected _proposalSink: PipelineProposalSink | undefined;

  /**
   * @purpose Bind runtime to the shared queue and, in production, its durable executor seams.
   * @param queue Queue shared with the HTTP task surface.
   * @param [registry] Policy registry used by concrete fan-out instances.
   * @param [journal] Durable journal required to start draining.
   * @param [runner] Optional stage hook; the production default writes the stage artifact set.
   * @param [stateDir] State root for the production artifact dispatcher. Required when no runner is supplied.
   * @param [opencode] Production AI adapter used for actual track/lens worker turns.
   * @param [proposalSink] Durable proposal writer used by production reviewer tails.
   */
  constructor(
    queue: TaskQueuePort,
    registry = new TaskRegistry(),
    journal?: JournalPort,
    runner?: PipelineTaskRunner,
    stateDir?: string,
    opencode?: OpenCodePort,
    proposalSink?: PipelineProposalSink
  ) {
    this._queue = queue;
    this._registry = registry;
    this._journal = journal ?? new VolatileJournal();
    this._durable = journal !== undefined;
    this._opencode = opencode;
    this._proposalSink = proposalSink;
    this._runner = runner ?? this._createArtifactRunner(stateDir);
  }

  /**
   * @purpose Start the boot-owned executor lifecycle.
   * @invariant Idempotent: repeated boot wiring never starts a second drainer.
   * @param [intervalMs] Poll interval for newly queued scheduler work.
   */
  start(intervalMs = 25): void {
    if (this._timer) return;
    if (!this._durable) {
      throw new Error('[PipelineRuntime#start] A durable JournalPort is required in production');
    }
    this.recover();
    this._timer = setInterval(() => void this.drain(), intervalMs);
    this._timer.unref();
    logger.info('[PipelineRuntime#start] [idle → draining]', { intervalMs });
  }

  /** @purpose Stop the queue lifecycle without changing queued work. */
  stop(): void {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
    logger.info('[PipelineRuntime#stop] [draining → stopped]');
  }

  /**
   * @purpose Replay every MR with durable task history before boot begins draining work.
   * @invariant Recovery is public boot lifecycle, never a test-only protected-method cast.
   */
  recover(): void {
    if (!this._durable) return;
    const mrs = new Set(
      this._journal
        .read()
        .filter((entry) => entry.kind === 'task_created' && typeof entry.mr === 'string')
        .map((entry) => entry.mr)
    );
    for (const mr of mrs) this._executorFor(mr).recover();
    logger.info('[PipelineRuntime#recover] [boot → recovered]', { mrCount: mrs.size });
  }

  /**
   * @purpose Run one drain pass for every MR currently known to the shared queue.
   * @returns Promise resolving after all ready nodes were executed and completed.
   */
  async drain(): Promise<void> {
    if (this._draining) return this._draining;
    this._draining = this._drainOnce().finally(() => {
      this._draining = null;
    });
    return this._draining;
  }

  /**
   * @purpose Execute one non-overlapping pass through all MR executors.
   * @returns Promise resolved once ready nodes finish their lifecycle transition.
   */
  protected async _drainOnce(): Promise<void> {
    for (const mr of this._queue.all().keys()) {
      const executor = this._executorFor(mr);
      const started = await executor.advance();
      for (const task of started) {
        try {
          await this._runner(task);
          await executor.complete(task.taskId);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          await executor.fail(task.taskId, message);
        }
      }
    }
  }

  /**
   * @purpose Materialize the authoritative root review DAG, including concrete fan-out and tail.
   * @param mr MR reference for the queue partition.
   * @param [options] Role and deterministic-plan track details.
   * @returns Queue task ids in materialized DAG order.
   */
  async startReview(mr: string, options: ReviewStartOptions = {}): Promise<string[]> {
    const role = options.role ?? 'reviewer';
    const plan = new PlanTemplate(new TriggerRegistry()).generate(mr, options.changeset ?? []);
    const tracks = options.tracks ?? plan.tracks.map((track) => track.id);
    const pipelineParams = {
      mr,
      createdBy: 'pipeline',
      changeset: options.changeset ?? [],
      toolTrace: options.toolTrace ?? [],
      modelResults: options.modelResults ?? [],
      plan,
    };
    const base = ['prepare_env', 'plan', 'enrich'];
    const taskIds: string[] = [];
    for (const type of base) {
      taskIds.push(await this._enqueue(mr, type, pipelineParams));
    }

    for (const track of tracks) {
      taskIds.push(
        await this._enqueue(mr, `track_${this._normalize(track)}`, {
          ...pipelineParams,
          layer: 'mandatory',
        })
      );
    }

    const lensResolution = new LensRegistry().resolveAll(tracks);
    for (const wave of lensResolution.mandatoryWaves)
      for (const lens of wave.lenses) {
        const dependsOn = lens.inputs.map(
          (input) => `lens_${this._normalize(input.replace(/^lens-/, ''))}`
        );
        taskIds.push(
          await this._enqueue(mr, `lens_${this._normalize(lens.id.replace(/^lens-/, ''))}`, {
            ...pipelineParams,
            layer: 'mandatory',
            lens,
            // Instance edges preserve LensSpec.inputs after the declarative registry has been
            // expanded. The immutable registry only knows the common enrich prerequisite.
            dependsOn,
          })
        );
      }

    for (const type of ['gate_coverage', 'synthesize', 'gate_verdict', `tail_${role}`]) {
      taskIds.push(await this._enqueue(mr, type, { ...pipelineParams, role }));
    }
    logger.info('[PipelineRuntime#startReview] [idle → queued]', { mr, role, tracks, taskIds });
    return taskIds;
  }

  /**
   * @purpose Materialize delta-review mini-DAG for a new MR head SHA.
   * @param mr MR reference for the queue partition.
   * @param lastReviewedHeadSha Last reviewed commit SHA.
   * @param headSha New head commit SHA.
   * @returns Queue task ids in mini-DAG dependency order.
   */
  async startDeltaReview(
    mr: string,
    lastReviewedHeadSha: string,
    headSha: string
  ): Promise<string[]> {
    const params = { mr, lastReviewedHeadSha, headSha, createdBy: 'pipeline' };
    const types = [
      'delta_review',
      'delta_prepare',
      'delta_changeset',
      'delta_tracks',
      'synthesize_delta',
      'gate_verdict_delta',
    ];
    const taskIds: string[] = [];
    for (const type of types) {
      taskIds.push(await this._enqueue(mr, type, params, `delta:${mr}:${type}`));
    }
    logger.info('[PipelineRuntime#startDeltaReview] [idle → queued]', {
      mr,
      lastReviewedHeadSha,
      headSha,
      taskIds,
    });
    return taskIds;
  }

  /**
   * @purpose Return or construct the durable Executor for one MR.
   * @param mr MR reference owning the executor.
   * @returns Durable per-MR executor.
   */
  protected _executorFor(mr: string): Executor {
    const existing = this._executors.get(mr);
    if (existing) return existing;
    const executor = new Executor(this._journal, this._registry, this._queue, mr);
    this._executors.set(mr, executor);
    return executor;
  }

  /**
   * @purpose Enqueue a materialized node with a stable per-MR dedup key.
   * @param mr MR reference.
   * @param type Concrete task type.
   * @param params Task parameters.
   * @param [key] Explicit stable dedup key.
   * @returns Queue task id.
   */
  protected async _enqueue(
    mr: string,
    type: string,
    params: Record<string, unknown>,
    key?: string
  ): Promise<string> {
    // Materialization must use the same durable seam as operator/API submissions. Without this,
    // a restart sees an empty queue even though a root DAG was visibly created before the crash.
    return (await this._executorFor(mr).enqueue(type, params, key ?? `pipeline:${mr}:${type}`))
      .taskId;
  }

  /**
   * @purpose Build the deterministic production stage dispatcher used when no role-specific runner is injected.
   * @param [stateDir] State root owning per-MR reports.
   * @returns Stage runner that emits the durable artifacts promised by the pipeline contract.
   */
  protected _createArtifactRunner(stateDir?: string): PipelineTaskRunner {
    if (!stateDir) {
      return async () => {
        throw new Error('[PipelineRuntime] Production stage runner requires stateDir');
      };
    }
    return async (task) => {
      const mr = typeof task.params.mr === 'string' ? task.params.mr : '';
      const reportDir = mrReportsDir(stateDir, this._reportRef(mr));
      const tasksDir = join(reportDir, 'tasks');
      await mkdir(tasksDir, { recursive: true });
      const plan = this._taskPlan(task, mr);
      const changeset = this._taskChangeset(task);

      if (task.type === 'prepare_env' || task.type === 'delta_prepare') {
        await this._writeArtifact(reportDir, 'environment.json', {
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
            (track) =>
              `- [ ] ${track.source}: ${track.id} — ${track.files.join(', ') || 'no files'}`
          )
          .join('\n');
        await writeFile(
          join(reportDir, 'PLAN.md'),
          `---\nmr: ${mr}\n---\n\n# План ревью\n\n${planText}\n`,
          'utf8'
        );
        await this._writeArtifact(
          reportDir,
          'plan.json',
          plan as unknown as Record<string, unknown>
        );
        return;
      }
      if (task.type === 'enrich') {
        const lenses = new LensRegistry().resolveAll(plan.tracks.map((track) => track.id));
        await this._writeArtifact(reportDir, 'enrich.json', {
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
              (track) => this._normalize(track.id) === task.type.slice('track_'.length)
            )?.files ?? [])
          : changeset.map((entry) => entry.path);
        const modelResult = await this._runWorker(task, reportDir, files);
        await this._writeArtifact(tasksDir, `${task.type}.result.json`, {
          taskId: task.taskId,
          type: task.type,
          mr,
          status: files.length > 0 ? 'reviewed' : 'no_applicable_files',
          files,
          findings: modelResult.findings,
          model: modelResult.model,
          runId: modelResult.runId,
        });
        await this._writeArtifact(
          tasksDir,
          `${task.type}.${modelResult.model}.result.json`,
          modelResult
        );
        return;
      }
      if (task.type === 'gate_coverage') {
        await this._runCoverageGate(task, reportDir, changeset);
        return;
      }
      if (task.type === 'synthesize' || task.type === 'synthesize_delta') {
        const findingsJournal = new FindingsJournal(join(reportDir, 'findings.jsonl'));
        const synthesize = new Synthesize(findingsJournal);
        const modelResults = await this._readWorkerResults(tasksDir);
        const seededResults = Array.isArray(task.params.modelResults)
          ? (task.params.modelResults as ModelResult[])
          : [];
        const synthesized = await synthesize.synthesize(
          modelResults.length > 0 ? modelResults : seededResults
        );
        const review: ReviewJson = {
          ...(synthesize.buildReviewJson(synthesized) as ReviewJson),
          verdict: 'COMMENT',
        };
        await this._writeArtifact(reportDir, 'review.json', review);
        // Публикуем итог ревью в ленту: без widget_bump feed состоит из одних progress-записей,
        // и оператор не видит, что ревью вообще состоялось (live-дефект приёмки S3).
        await this._journal.append({
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
        await this._writeArtifact(reportDir, 'verdict.json', {
          mr,
          ...result,
          verdict: review.verdict,
        });
        if (result.status === 'fail')
          throw new Error(`Review verdict invalid: ${result.reasons.join('; ')}`);
        return;
      }
      if (task.type.startsWith('tail_')) {
        if (task.type === 'tail_reviewer' && this._proposalSink && mr) {
          const proposal: ProposalRecord = {
            proposalId: `pipeline:${task.taskId}:post_findings`,
            capability: 'post_findings',
            mr,
            payload: { reviewArtifact: 'review.json', taskId: task.taskId },
            producedBy: { sessionId: `pipeline:${task.taskId}`, taskId: task.taskId },
          };
          await this._proposalSink(proposal);
          logger.info('[PipelineRuntime#_createArtifactRunner] [tail → proposal_persisted]', {
            mr,
            proposalId: proposal.proposalId,
          });
        }
        await this._writeArtifact(reportDir, `${task.type}.json`, {
          mr,
          taskId: task.taskId,
          status: 'completed',
        });
        return;
      }
      await this._writeArtifact(tasksDir, `${task.type}.result.json`, {
        taskId: task.taskId,
        type: task.type,
        mr,
        status: 'completed',
      });
    };
  }

  /**
   * @purpose Read the materialized deterministic plan from task parameters or reconstruct it.
   * @param task Queue node carrying persisted plan input.
   * @param mr MR reference used when a recovered legacy node needs reconstruction.
   * @returns Deterministic review plan for this task's MR.
   */
  protected _taskPlan(task: TaskInstance, mr: string): ReviewPlan {
    const candidate = task.params.plan;
    if (candidate && typeof candidate === 'object') return candidate as ReviewPlan;
    return new PlanTemplate(new TriggerRegistry()).generate(mr, this._taskChangeset(task));
  }

  /**
   * @purpose Narrow externally persisted params to valid changeset entries.
   * @param task Queue node carrying persisted changeset input.
   * @returns Valid changeset entries only.
   */
  protected _taskChangeset(task: TaskInstance): ChangesetEntry[] {
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
   * @purpose Execute a concrete fan-out node through the injected OpenCode production seam.
   * @invariant Production never fabricates an empty model result: a missing/invalid model turn
   * fails its queue task, while deterministic tests may supply explicit modelResults.
   * @param task Materialized track or lens queue instance.
   * @param reportDir Durable report directory used as the worker session root.
   * @param files Changed files assigned to this worker.
   * @returns Validated model result with factual session identity.
   */
  protected async _runWorker(
    task: TaskInstance,
    reportDir: string,
    files: string[]
  ): Promise<ModelResult> {
    const seeded = Array.isArray(task.params.modelResults)
      ? (task.params.modelResults as ModelResult[]).find(
          (result) => this._normalize(result.track) === task.type.replace(/^(track_|lens_)/, '')
        )
      : undefined;
    if (!this._opencode) {
      if (seeded) return seeded;
      throw new Error(`[PipelineRuntime#_runWorker] Missing OpenCode worker for ${task.type}`);
    }

    const title = `pipeline_${task.type}`;
    // Session root = MR root (parent of reportDir): the checked-out repo lives in ./worktree
    // and prior-step artifacts in ./report — rooting at reportDir alone left the sources
    // outside the session's allowed paths and workers narrated "no access" prose (NO_RESULT).
    const session = await this._opencode.createSession({
      title,
      directory: dirname(reportDir),
      tools: { read: true, grep: true },
    });
    try {
      const result = await this._opencode.prompt(session.sid, {
        system:
          'Review the assigned MR scope. Return ONLY one ```json fenced code block matching the schema — no prose before or after. Empty result is {"findings": []}.',
        text: `Worker ${task.type}; MR ${String(task.params.mr)}; files: ${files.join(', ') || '(no changed files)'} — read sources under ./worktree/ (repo checkout), prior-step artifacts under ./report/`,
        format: {
          type: 'json_schema',
          schema: {
            title,
            type: 'object',
            required: ['findings'],
            properties: {
              findings: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['file', 'line', 'summary', 'severity'],
                  properties: {
                    file: { type: 'string' },
                    line: { type: 'number' },
                    summary: { type: 'string' },
                    severity: { enum: ['error', 'warning', 'info'] },
                  },
                },
              },
            },
          },
        },
      });
      if (!result.ok)
        throw new Error(
          `[PipelineRuntime#_runWorker] ${result.error.class}: ${result.error.signal ?? ''}`
        );
      const findings = this._parseFindings(result.output.findings, task.type);
      const calls = await this._opencode.toolCalls(session.sid);
      await this._appendToolTrace(reportDir, calls);
      this._rememberWorkerSession(String(task.params.mr), {
        sid: session.sid,
        taskType: task.type,
      });
      return { track: task.type, model: `opencode-${task.type}`, runId: session.sid, findings };
    } catch (cause) {
      await this._opencode.close(session.sid);
      throw cause;
    }
  }

  /**
   * @purpose Recover factual coverage through a retained worker session, then write an explicit operator escalation when it remains incomplete.
   * @invariant At most two continuations use the same session id; all retained sessions close only after this gate resolves.
   * @param task Coverage queue node containing MR and original trace input.
   * @param reportDir Durable report root.
   * @param changeset Changed files forming the must-read checklist.
   * @returns Promise resolving when coverage passes; rejects only after durable escalation is recorded.
   */
  protected async _runCoverageGate(
    task: TaskInstance,
    reportDir: string,
    changeset: ChangesetEntry[]
  ): Promise<void> {
    const mr = String(task.params.mr);
    const checklist = changeset.map((entry) => entry.path);
    const deletedFiles = changeset
      .filter((entry) => entry.action === 'deleted')
      .map((entry) => entry.path);
    const liveTrace = await this._readToolTrace(reportDir);
    const initialTrace =
      liveTrace.length > 0 ? liveTrace : ((task.params.toolTrace as ToolTrace[] | undefined) ?? []);
    const gate = new CoverageGate();
    try {
      const coverage = await gate.recoverWithContinue(
        checklist,
        initialTrace,
        async (missingFiles, attempt) =>
          this._continueCoverageWorker(mr, reportDir, missingFiles, attempt),
        deletedFiles
      );
      await this._writeArtifact(
        reportDir,
        'coverage.json',
        coverage as unknown as Record<string, unknown>
      );
    } catch (cause) {
      const coverage = gate.check(checklist, await this._readToolTrace(reportDir), deletedFiles);
      await this._writeArtifact(
        reportDir,
        'coverage.json',
        coverage as unknown as Record<string, unknown>
      );
      await this._writeArtifact(reportDir, 'operator-escalation.json', {
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
      await this._closeWorkerSessions(mr);
    }
  }

  /**
   * @purpose Ask one retained worker to read the missing files without discarding its session context.
   * @param mr MR whose active workers own the accumulated tool trace.
   * @param reportDir Durable report root receiving factual continuation telemetry.
   * @param missingFiles Files the gate still requires.
   * @param attempt One-based continuation attempt.
   * @returns Entire factual trace after this same-session continuation turn.
   */
  protected async _continueCoverageWorker(
    mr: string,
    reportDir: string,
    missingFiles: string[],
    attempt: number
  ): Promise<ToolTrace[]> {
    const worker = this._workerSessions.get(mr)?.at(-1);
    if (!worker || !this._opencode) return this._readToolTrace(reportDir);
    const response = await this._opencode.continueSignal(worker.sid, {
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
    await this._appendToolTrace(reportDir, await this._opencode.toolCalls(worker.sid));
    return this._readToolTrace(reportDir);
  }

  /**
   * @purpose Retain a successful worker session until the downstream coverage gate consumes it.
   * @param mr MR partition that owns the worker session.
   * @param session OpenCode identity and source fan-out node.
   */
  protected _rememberWorkerSession(mr: string, session: PipelineWorkerSession): void {
    const sessions = this._workerSessions.get(mr) ?? [];
    sessions.push(session);
    this._workerSessions.set(mr, sessions);
  }

  /**
   * @purpose Close retained worker sessions after coverage terminally passes or escalates.
   * @param mr MR partition whose sessions must be released.
   * @returns Promise resolved once every retained session has been closed.
   */
  protected async _closeWorkerSessions(mr: string): Promise<void> {
    const sessions = this._workerSessions.get(mr) ?? [];
    this._workerSessions.delete(mr);
    if (!this._opencode) return;
    await Promise.all(sessions.map((session) => this._opencode!.close(session.sid)));
  }

  /**
   * @purpose Validate model findings before they enter durable review artifacts.
   * @param value Raw structured output field from the worker.
   * @param taskType Concrete worker type used in failure context.
   * @returns Valid review findings only.
   */
  protected _parseFindings(value: unknown, taskType: string): ModelResult['findings'] {
    if (!Array.isArray(value))
      throw new Error(`[PipelineRuntime#_parseFindings] ${taskType} returned no findings array`);
    return value.map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as Record<string, unknown>).file !== 'string' ||
        typeof (entry as Record<string, unknown>).line !== 'number' ||
        typeof (entry as Record<string, unknown>).summary !== 'string' ||
        !['error', 'warning', 'info'].includes(String((entry as Record<string, unknown>).severity))
      )
        throw new Error(`[PipelineRuntime#_parseFindings] ${taskType} returned invalid finding`);
      const finding = entry as {
        file: string;
        line: number;
        summary: string;
        severity: 'error' | 'warning' | 'info';
      };
      return finding;
    });
  }

  /**
   * @purpose Persist factual read telemetry from each worker for the later coverage gate.
   * @param reportDir Durable report root for this MR.
   * @param calls Factual tool calls returned by OpenCodePort.
   * @returns Promise resolving once telemetry is atomically persisted.
   */
  protected async _appendToolTrace(reportDir: string, calls: ToolCall[]): Promise<void> {
    const target = join(reportDir, 'tool-trace.json');
    const existing = await import('node:fs/promises')
      .then(async ({ readFile }) => {
        const document = JSON.parse(await readFile(target, 'utf8')) as { entries?: ToolTrace[] };
        return Array.isArray(document.entries) ? document.entries : [];
      })
      .catch(() => [] as ToolTrace[]);
    const appended = [...existing, ...calls.map((call) => ({ tool: call.tool, file: call.path }))];
    await this._writeArtifact(reportDir, 'tool-trace.json', { entries: appended });
  }

  /**
   * @purpose Read persisted live tool telemetry without treating corrupt recovery data as coverage proof.
   * @param reportDir Durable report root for this MR.
   * @returns Valid factual tool trace entries, or an empty list when no valid artifact exists.
   */
  protected async _readToolTrace(reportDir: string): Promise<ToolTrace[]> {
    return import('node:fs/promises')
      .then(async ({ readFile }) => {
        const document = JSON.parse(await readFile(join(reportDir, 'tool-trace.json'), 'utf8')) as {
          entries?: ToolTrace[];
        };
        return Array.isArray(document.entries) ? document.entries : [];
      })
      .catch(() => [] as ToolTrace[]);
  }

  /**
   * @purpose Read all named worker results so synthesis consumes durable live outputs after restart.
   * @param tasksDir Directory containing per-worker durable artifacts.
   * @returns Valid named model results.
   */
  protected async _readWorkerResults(tasksDir: string): Promise<ModelResult[]> {
    const { readdir, readFile } = await import('node:fs/promises');
    const names = await readdir(tasksDir).catch(() => [] as string[]);
    const results: ModelResult[] = [];
    for (const name of names.filter((entry) =>
      /^((track|lens)_.+)\.opencode-[^.]+\.result\.json$/.test(entry)
    )) {
      const candidate = JSON.parse(await readFile(join(tasksDir, name), 'utf8')) as ModelResult;
      if (candidate && Array.isArray(candidate.findings) && typeof candidate.track === 'string')
        results.push(candidate);
    }
    return results;
  }

  /**
   * @purpose Persist one JSON artifact with a temp sibling so readers never observe partial JSON.
   * @param dir Existing artifact directory.
   * @param name Artifact file name relative to `dir`.
   * @param document JSON-compatible artifact document.
   * @returns Promise resolving after the atomic replacement completes.
   */
  protected async _writeArtifact(
    dir: string,
    name: string,
    document: Record<string, unknown>
  ): Promise<void> {
    const target = join(dir, name);
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temp, target);
  }

  /**
   * @purpose Normalize an API web URL to the report path's `project!iid` identity.
   * @param mr Queue MR reference or GitLab web URL.
   * @returns Canonical report path identity.
   */
  protected _reportRef(mr: string): string {
    if (mr.includes('!')) return mr;
    const match = /\/([^/]+(?:\/[^/]+)*)\/-\/merge_requests\/(\d+)$/.exec(mr);
    return match ? `${match[1]}!${match[2]}` : mr;
  }

  /**
   * @purpose Convert plan/lens identifiers to concrete queue task type suffixes.
   * @param value Plan or lens identifier.
   * @returns Queue-safe suffix.
   */
  protected _normalize(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
}
