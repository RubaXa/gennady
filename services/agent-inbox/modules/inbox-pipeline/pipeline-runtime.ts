// @file: PipelineRuntime — boot-owned materializer and executor lifecycle for review/delta DAGs.
// @consumers: agent-inbox serve bootstrap, RoleScheduler
// @tasks: TSK-157, TSK-161, TSK-173, TSK-184, TSK-190

import { logger } from '#logger';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  canonicalMrRef,
  mrReportsDir,
} from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { ToolTrace } from './coverage-gate.ts';
import type { ChangesetEntry } from './plan-template.ts';
import type { ModelResult } from './synthesize.ts';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import type { OpenCodePort } from '../inbox-opencode/opencode.port.ts';
import { Executor } from '../inbox-queue/executor.ts';
import { TaskRegistry, type TaskInstance } from '../inbox-queue/task-registry.ts';
import type { TaskQueuePort } from '../inbox-queue/task-queue.ts';
import { ReviewRepairCoordinator } from './completeness/review-repair-coordinator.ts';
import type { ReviewManifestCapture } from './planning/review-input-manifest-builder.ts';
import type { ReviewIntent, ReviewManifestKey } from './types/review-intent.type.ts';
import { VolatileJournal } from './runtime/control-plane-journals.ts';
import { composeControlPlane } from './runtime/control-plane-composer.ts';
import { materializeReviewTasks, materializeDeltaReviewTasks } from './runtime/dag-materializer.ts';
import { dispatchPostingEffects } from './runtime/effect-dispatcher.ts';
import {
  runCoverageGate,
  continueCoverageWorker,
  rememberWorkerSession,
  closeWorkerSessions,
} from './runtime/coverage-gate-runner.ts';
import { reportRef } from './runtime/artifact-io.ts';
import { createArtifactRunner } from './runtime/artifact-stage-runner.ts';
import { runWorker } from './runtime/worker-executor.ts';
import {
  executeControlPlaneReview,
  manifestRevision,
} from './runtime/control-plane-review-executor.ts';
import type {
  PipelineControlPlaneConfig,
  PipelineControlPlaneAuthorization,
  PipelineControlPlaneComposition,
  PipelineControlPlaneConstructionTrace,
  PipelineControlPlanePreparation,
  PipelineCompletion,
  PipelineReviewReadback,
  PipelineTaskRunner,
  PipelineProposalSink,
  PipelineWorkerSession,
  ReviewStartOptions,
} from './runtime/pipeline-runtime.types.ts';
export type {
  PipelineRole,
  ReviewStartOptions,
  PipelineTaskRunner,
  PipelineProposalSink,
} from './runtime/pipeline-runtime.types.ts';

/** @purpose Queue-backed production lifecycle for deterministic pipeline DAG materialization. */
export class PipelineRuntime {
  /** @purpose Stable identity shared by construction trace and runtime diagnostics. */
  readonly identity: string;
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
  /** @purpose Profile-rooted state directory owning canonical persisted review artifacts. */
  protected readonly _stateDir: string | undefined;
  /** @purpose One reachable deterministic control-plane composition owned by this runtime. */
  protected readonly _controlPlane: PipelineControlPlaneComposition | undefined;
  /** @purpose Separate durable generic journal for control records, never canonical review events. */
  protected readonly _controlJournal: JournalPort | undefined;
  /** @purpose Operator-selected model for deterministic control-plane agent turns. */
  protected readonly _controlPlaneModel: string | undefined;

  /**
   * @purpose Bind runtime to the shared queue and, in production, its durable executor seams.
   * @param queue Queue shared with the HTTP task surface.
   * @param [registry] Policy registry used by concrete fan-out instances.
   * @param [journal] Durable journal required to start draining.
   * @param [runner] Optional stage hook; the production default writes the stage artifact set.
   * @param [stateDir] State root for the production artifact dispatcher. Required when no runner is supplied.
   * @param [opencode] Production AI adapter used for actual track/lens worker turns.
   * @param [proposalSink] Durable proposal writer used by production reviewer tails.
   * @param [controlPlane] Production-only deterministic control-plane dependencies.
   */
  constructor(
    queue: TaskQueuePort,
    registry = new TaskRegistry(),
    journal?: JournalPort,
    runner?: PipelineTaskRunner,
    stateDir?: string,
    opencode?: OpenCodePort,
    proposalSink?: PipelineProposalSink,
    controlPlane?: PipelineControlPlaneConfig
  ) {
    this.identity = `pipeline-runtime:${controlPlane?.runtimeNamespace ?? 'isolated'}:${randomUUID()}`;
    this._queue = queue;
    this._registry = registry;
    this._journal = journal ?? new VolatileJournal();
    this._durable = journal !== undefined;
    this._opencode = opencode;
    this._proposalSink = proposalSink;
    this._stateDir = stateDir;
    this._runner = runner ?? this._createArtifactRunner(stateDir);
    if (controlPlane?.journal === this._journal) {
      throw new Error('[PipelineRuntime#constructor] Task and control journals must be separate');
    }
    this._controlJournal = controlPlane?.journal;
    this._controlPlaneModel = controlPlane?.model;
    this._controlPlane = controlPlane ? composeControlPlane(controlPlane) : undefined;
  }

  /**
   * @purpose Expose the exact production instances owned by this existing runtime.
   * @returns Owned composition, or undefined for an isolated legacy runtime.
   */
  retrieveControlPlane(): PipelineControlPlaneComposition | undefined {
    return this._controlPlane;
  }

  /**
   * @purpose Expose typed construction identity without constructing a parallel runtime.
   * @returns Immutable construction trace, or undefined when control-plane wiring is absent.
   */
  retrieveControlPlaneConstructionTrace(): PipelineControlPlaneConstructionTrace | undefined {
    if (!this._controlPlane || !this._controlJournal) return undefined;
    return Object.freeze({
      runtimeIdentity: this.identity,
      taskJournalIdentity: this._journal.identity,
      controlJournalIdentity: this._controlJournal.identity,
      separateControlJournal: true,
      boundaries: Object.freeze({
        manifestBuilder: this._controlPlane.manifestBuilder.constructor.name,
        contractCompiler: this._controlPlane.contractCompiler.constructor.name,
        receiptRecorder: this._controlPlane.receiptRecorder.constructor.name,
        structuralValidator: this._controlPlane.structuralValidator.constructor.name,
        repairCoordinator: ReviewRepairCoordinator.name,
        freshnessGate: this._controlPlane.freshnessGate.constructor.name,
        orchestrator: this._controlPlane.orchestrator.constructor.name,
        synthesis: this._controlPlane.synthesis.constructor.name,
        effectCoordinator:
          this._controlPlane.effectCoordinator?.constructor.name ?? 'UNAVAILABLE_IN_PROFILE',
      }),
    });
  }

  /**
   * @purpose Drive manifest sealing and contract compilation through this runtime's real control path.
   * @param intent Role-invariant review intent with exact manifest identity.
   * @param capture Complete immutable source capture.
   * @returns Persisted manifest and optional compiled contract.
   */
  async prepareControlPlaneReview(
    intent: ReviewIntent,
    capture: ReviewManifestCapture
  ): Promise<PipelineControlPlanePreparation> {
    if (!this._controlPlane || !this._controlJournal)
      throw new Error('[PipelineRuntime#prepareControlPlaneReview] Control plane is unavailable');
    const manifest = this._controlPlane.manifestBuilder.captureAndSeal(intent, capture);
    await this._controlJournal.append({
      ts: new Date().toISOString(),
      mr: intent.manifestKey.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: { event: 'manifest_terminal', status: manifest.status, manifest },
    });
    if (manifest.status === 'BLOCKED') return Object.freeze({ manifest });
    const contract = this._controlPlane.contractCompiler.compileAtomically(manifest, intent);
    await this._controlJournal.append({
      ts: new Date().toISOString(),
      mr: intent.manifestKey.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: { event: 'contract_terminal', status: contract.status, contract },
    });
    return Object.freeze({ manifest, contract });
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
   * @purpose Drain one submitted review to a queue terminal state without an unbounded poll loop.
   * @param mr MR queue partition owning the submitted task ids.
   * @param taskIds Exact task ids returned by `startReview`.
   * @param [maxPasses] Maximum non-overlapping queue drain passes.
   * @returns Terminal queue result owned by this runtime identity.
   */
  async awaitCompletion(
    mr: string,
    taskIds: readonly string[],
    maxPasses = 50
  ): Promise<PipelineCompletion> {
    mr = canonicalMrRef(mr);
    for (let pass = 0; pass < maxPasses; pass++) {
      await this.drain();
      const tasks = this._completionTasks(mr, taskIds);
      const failed = tasks.find((task) => task.status === 'failed');
      if (failed) {
        return Object.freeze({
          runtimeIdentity: this.identity,
          mr,
          state: 'failed',
          taskIds: Object.freeze([...taskIds]),
          tasks: Object.freeze(tasks),
          error: `Pipeline task failed: ${failed.type} (${failed.taskId})`,
        });
      }
      if (tasks.length === taskIds.length && tasks.every((task) => task.status === 'done')) {
        return Object.freeze({
          runtimeIdentity: this.identity,
          mr,
          state: 'completed',
          taskIds: Object.freeze([...taskIds]),
          tasks: Object.freeze(tasks),
        });
      }
    }
    return Object.freeze({
      runtimeIdentity: this.identity,
      mr,
      state: 'blocked',
      taskIds: Object.freeze([...taskIds]),
      tasks: Object.freeze(this._completionTasks(mr, taskIds)),
      error: `Pipeline did not reach a terminal state within ${maxPasses} drain passes`,
    });
  }

  /**
   * @purpose Read the canonical report and per-task JSON artifacts persisted by this runtime.
   * @param mr MR reference used by the report directory mapping.
   * @returns Runtime-identified artifact map; absent files are omitted, malformed files fail closed.
   */
  async readReviewArtifacts(mr: string): Promise<PipelineReviewReadback> {
    if (!this._stateDir)
      throw new Error('[PipelineRuntime#readReviewArtifacts] State directory is unavailable');
    mr = canonicalMrRef(mr);
    const reportDir = mrReportsDir(this._stateDir, reportRef(mr));
    const artifacts: Record<string, unknown> = {};
    for (const name of await readdir(reportDir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) continue;
      artifacts[name] = JSON.parse(await readFile(join(reportDir, name), 'utf8'));
    }
    const tasksDir = join(reportDir, 'tasks');
    for (const name of await readdir(tasksDir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) continue;
      artifacts[`tasks/${name}`] = JSON.parse(await readFile(join(tasksDir, name), 'utf8'));
    }
    return Object.freeze({
      runtimeIdentity: this.identity,
      mr,
      artifacts: Object.freeze(artifacts),
    });
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
   * @purpose Project exact submitted task ids into immutable completion telemetry.
   * @param mr Queue lane containing the submitted review.
   * @param taskIds Exact submitted task identifiers.
   * @returns Immutable terminal-status projections for found tasks.
   */
  protected _completionTasks(
    mr: string,
    taskIds: readonly string[]
  ): Readonly<Pick<TaskInstance, 'taskId' | 'type' | 'status'>>[] {
    return taskIds.flatMap((taskId) => {
      const task = this._queue.instance(mr, taskId);
      return task ? [{ taskId: task.taskId, type: task.type, status: task.status }] : [];
    });
  }

  /**
   * @purpose Materialize the authoritative root review DAG, including concrete fan-out and tail.
   * @param mr MR reference for the queue partition.
   * @param [options] Role and deterministic-plan track details.
   * @returns Queue task ids in materialized DAG order.
   */
  async startReview(mr: string, options: ReviewStartOptions = {}): Promise<string[]> {
    mr = canonicalMrRef(mr);
    if (!this._controlPlane) return this._materializeReview(mr, options);
    if (!options.controlPlaneInput) {
      throw new Error('[PipelineRuntime#startReview] Exact control-plane input is required');
    }
    if (canonicalMrRef(options.controlPlaneInput.intent.manifestKey.mr) !== mr) {
      throw new Error(
        '[PipelineRuntime#startReview] Manifest MR identity does not match queue lane'
      );
    }
    const authorization = await this._executeControlPlaneReview(options.controlPlaneInput);
    const handoff = await this._controlPlane.freshnessGate.guard(
      'QUEUE_HANDOFF',
      authorization.intent.manifestKey,
      () => this._manifestRevision(authorization.intent.manifestKey),
      () => this._materializeReview(mr, options)
    );
    if (handoff.status !== 'FRESH') {
      throw new Error(`[PipelineRuntime#startReview] Queue handoff ${handoff.status}`);
    }
    return handoff.value;
  }

  /**
   * @purpose Execute every deterministic trust boundary before queue eligibility.
   * @param input Exact intent and immutable capture for one round.
   * @returns Authorized manifest and contract after fresh synthesis publication.
   */
  protected async _executeControlPlaneReview(
    input: Readonly<{ intent: ReviewIntent; capture: ReviewManifestCapture }>
  ): Promise<PipelineControlPlaneAuthorization> {
    return executeControlPlaneReview(input, {
      controlPlane: this._controlPlane,
      controlJournal: this._controlJournal,
      stateDir: this._stateDir,
      opencode: this._opencode,
      controlPlaneModel: this._controlPlaneModel,
      identity: this.identity,
      prepareControlPlaneReview: (intent, capture) =>
        this.prepareControlPlaneReview(intent, capture),
    });
  }

  /**
   * @purpose Normalize one immutable manifest key into the freshness transaction revision.
   * @param key Exact observed MR key supplied by the control-plane caller.
   * @returns Canonical head and event cursor revision.
   */
  protected _manifestRevision(key: ReviewManifestKey): string {
    return manifestRevision(key);
  }

  /**
   * @purpose Materialize the queue DAG only after deterministic authorization.
   * @param mr Queue lane receiving the review DAG.
   * @param [options] Role, plan and authorized control-plane inputs.
   * @returns Queue task identifiers in materialization order.
   */
  protected async _materializeReview(
    mr: string,
    options: ReviewStartOptions = {}
  ): Promise<string[]> {
    const { role, tracks, descriptors } = materializeReviewTasks(mr, options);
    const taskIds: string[] = [];
    for (const descriptor of descriptors) {
      taskIds.push(await this._enqueue(mr, descriptor.type, descriptor.params, descriptor.key));
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
    const descriptors = materializeDeltaReviewTasks(mr, lastReviewedHeadSha, headSha);
    const taskIds: string[] = [];
    for (const descriptor of descriptors) {
      taskIds.push(await this._enqueue(mr, descriptor.type, descriptor.params, descriptor.key));
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
    return createArtifactRunner(stateDir, {
      runWorker: (task, reportDir, files) => this._runWorker(task, reportDir, files),
      runCoverageGate: (task, reportDir, changeset) =>
        this._runCoverageGate(task, reportDir, changeset),
      dispatchPostingEffects: (task, reportDir) => this._dispatchPostingEffects(task, reportDir),
      proposalSink: this._proposalSink,
      journal: this._journal,
    });
  }

  /**
   * @purpose Execute the operator's "post findings" effect: read canonical `review.json` findings
   *   and post each as a top-level 🤖 comment through the permission-gated Effects layer.
   * @invariant Missing coordinator or findings yields a no-op artifact without crashing the drain loop.
   * @param task Queue effect node (`effect` | `post_findings`).
   * @param reportDir Canonical per-MR report directory.
   * @returns Completion after every finding is posted or degraded.
   * @sideEffect One GitLab comment per finding; writes `effect.result.json` + a feed widget event.
   */
  protected async _dispatchPostingEffects(task: TaskInstance, reportDir: string): Promise<void> {
    return dispatchPostingEffects(task, reportDir, {
      coordinator: this._controlPlane?.effectCoordinator,
      journal: this._journal,
    });
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
    return runWorker(task, reportDir, files, {
      opencode: this._opencode,
      sessions: this._workerSessions,
    });
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
    return runCoverageGate(task, reportDir, changeset, {
      sessions: this._workerSessions,
      opencode: this._opencode,
    });
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
    return continueCoverageWorker(mr, reportDir, missingFiles, attempt, {
      sessions: this._workerSessions,
      opencode: this._opencode,
    });
  }

  /**
   * @purpose Retain a successful worker session until the downstream coverage gate consumes it.
   * @param mr MR partition that owns the worker session.
   * @param session OpenCode identity and source fan-out node.
   */
  protected _rememberWorkerSession(mr: string, session: PipelineWorkerSession): void {
    rememberWorkerSession(mr, session, this._workerSessions);
  }

  /**
   * @purpose Close retained worker sessions after coverage terminally passes or escalates.
   * @param mr MR partition whose sessions must be released.
   * @returns Promise resolved once every retained session has been closed.
   */
  protected async _closeWorkerSessions(mr: string): Promise<void> {
    return closeWorkerSessions(mr, { sessions: this._workerSessions, opencode: this._opencode });
  }
}
