// @file: PipelineRuntime — boot-owned materializer and executor lifecycle for review/delta DAGs.
// @consumers: agent-inbox serve bootstrap, RoleScheduler
// @tasks: TSK-157, TSK-161, TSK-173, TSK-184, TSK-190

import { logger } from '#logger';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
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
import { LocalReviewRuntimeReceiptStoreAdapter } from './adapters/local-review-runtime-receipt-store.adapter.ts';
import {
  ReviewRepairCoordinator,
  type ReviewRepairJournal,
  type ReviewRepairState,
} from './coverage/review-repair-coordinator.ts';
import { ReviewStructuralValidator } from './coverage/review-structural-validator.ts';
import { ReviewSlotSchemaCatalog } from './model/review-slot-schema-catalog.ts';
import { ReviewSynthesis } from './model/review-synthesis.ts';
import { ReviewContractCompiler } from './planning/review-contract-compiler.ts';
import {
  ReviewInputManifestBuilder,
  type ReviewManifestCapture,
} from './planning/review-input-manifest-builder.ts';
import { ReviewRuntimeReceiptRecorder } from './receipts/review-runtime-receipt-recorder.ts';
import { ReviewOrchestrator } from './review/review-orchestrator.ts';
import {
  ReviewFreshnessGate,
  type ReviewFreshnessJournal,
  type ReviewFreshnessPurpose,
  type ReviewGuardedTransition,
} from './verification/review-freshness-gate.ts';
import type { ReviewIntent, ReviewManifestKey } from './types/review-intent.type.ts';
import type { ReviewInputManifestResult } from './model/review-input-manifest.ts';
import type { ReviewContractCompilationResult } from './model/review-contract.ts';
import type { ReviewContract } from './model/review-contract.ts';
import type { ReviewInputManifest } from './model/review-input-manifest.ts';
import type { ReviewArtifact } from './model/review-artifact.ts';
import type { ReviewEvidence } from './types/review-evidence.type.ts';
import { ReviewEffectCoordinator } from '../inbox-queue/effects/review-effect-coordinator.ts';
import { ReviewActionCatalog } from '../inbox-queue/registry/review-action-catalog.ts';
import type { VcsPort } from '../inbox-vcs/vcs-port.ts';

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

/** @purpose Durable state adapter for one review round stored outside canonical review events. */
class EventReviewRepairJournal implements ReviewRepairJournal {
  protected readonly _journal: JournalPort;
  protected readonly _key: ReviewManifestKey;
  protected readonly _roundId: string;
  protected readonly _maxAttempts: number;

  constructor(journal: JournalPort, key: ReviewManifestKey, roundId: string, maxAttempts = 3) {
    this._journal = journal;
    this._key = key;
    this._roundId = roundId;
    this._maxAttempts = maxAttempts;
  }

  async retrieve(): Promise<ReviewRepairState> {
    const state = this._journal
      .read()
      .filter(
        (entry) =>
          entry.kind === 'system' &&
          entry.mr === this._key.mr &&
          entry.actor === 'review-control-plane' &&
          entry.payload?.event === 'repair_state' &&
          entry.payload?.roundId === this._roundId &&
          JSON.stringify(entry.payload?.manifestKey) === JSON.stringify(this._key)
      )
      .at(-1)?.payload?.state;
    if (this._isRepairState(state)) return state;
    return { roundId: this._roundId, attempt: 0, maxAttempts: this._maxAttempts, provenance: [] };
  }

  async persist(state: ReviewRepairState): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: this._key.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: { event: 'repair_state', manifestKey: this._key, roundId: this._roundId, state },
    });
  }

  protected _isRepairState(value: unknown): value is ReviewRepairState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate.roundId === this._roundId &&
      typeof candidate.attempt === 'number' &&
      typeof candidate.maxAttempts === 'number' &&
      Array.isArray(candidate.provenance)
    );
  }
}

/** @purpose Durable per-MR freshness transitions stored in the generic control-plane journal. */
class EventReviewFreshnessJournal implements ReviewFreshnessJournal {
  protected readonly _journal: JournalPort;

  constructor(journal: JournalPort) {
    this._journal = journal;
  }

  async recordGuardTransaction(
    purpose: ReviewFreshnessPurpose,
    key: ReviewManifestKey,
    observedRevision: string,
    transition?: ReviewGuardedTransition
  ): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr: key.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: {
        event: 'freshness_guard_transaction',
        purpose,
        key,
        observedRevision,
        comparison: transition ? 'MATCH' : 'STALE',
        transition,
        deltaRequested: transition ? false : true,
      },
    });
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
  /** @purpose Exact immutable review input required by the production control plane. */
  controlPlaneInput?: Readonly<{ intent: ReviewIntent; capture: ReviewManifestCapture }>;
};

/** @purpose Production dependencies from which PipelineRuntime owns one control-plane composition. */
type PipelineControlPlaneConfig = Readonly<{
  journal: JournalPort;
  receiptRoot: string;
  runtimeNamespace: string;
  model?: string;
  vcs?: VcsPort;
}>;

type PipelineControlPlaneAuthorization = Readonly<{
  intent: ReviewIntent;
  manifest: ReviewInputManifest;
  contract: ReviewContract;
}>;

/** @purpose Reachable concrete control-plane instances owned by one PipelineRuntime. */
type PipelineControlPlaneComposition = Readonly<{
  manifestBuilder: ReviewInputManifestBuilder;
  contractCompiler: ReviewContractCompiler;
  receiptRecorder: ReviewRuntimeReceiptRecorder;
  structuralValidator: ReviewStructuralValidator;
  repairCoordinator: (
    keyOrRoundId: ReviewManifestKey | string,
    roundId?: string
  ) => ReviewRepairCoordinator;
  freshnessGate: ReviewFreshnessGate;
  orchestrator: ReviewOrchestrator;
  synthesis: ReviewSynthesis;
  effectCoordinator: ReviewEffectCoordinator | null;
}>;

/** @purpose Typed identity trace proving one production owner for every mandatory boundary. */
type PipelineControlPlaneConstructionTrace = Readonly<{
  runtimeIdentity: string;
  taskJournalIdentity: string;
  controlJournalIdentity: string;
  separateControlJournal: true;
  boundaries: Readonly<Record<keyof PipelineControlPlaneComposition, string>>;
}>;

/** @purpose Durable manifest and contract preparation result from the boot-owned runtime. */
type PipelineControlPlanePreparation = Readonly<{
  manifest: ReviewInputManifestResult;
  contract?: ReviewContractCompilationResult;
}>;

/** @purpose Bounded terminal result observed from the runtime-owned durable task queue. */
type PipelineCompletion = Readonly<{
  runtimeIdentity: string;
  mr: string;
  state: 'completed' | 'failed' | 'blocked';
  taskIds: readonly string[];
  tasks: readonly Readonly<Pick<TaskInstance, 'taskId' | 'type' | 'status'>>[];
  error?: string;
}>;

/** @purpose Canonical persisted artifacts read from the same runtime that drained the review. */
type PipelineReviewReadback = Readonly<{
  runtimeIdentity: string;
  mr: string;
  artifacts: Readonly<Record<string, unknown>>;
}>;

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
    this._controlPlane = controlPlane ? this._composeControlPlane(controlPlane) : undefined;
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
   * @purpose Construct every deterministic boundary once under the existing runtime owner.
   * @param config Durable journal, receipt root, namespace and optional effect provider.
   * @returns One immutable reachable control-plane composition.
   */
  protected _composeControlPlane(
    config: PipelineControlPlaneConfig
  ): PipelineControlPlaneComposition {
    const receiptStore = new LocalReviewRuntimeReceiptStoreAdapter(
      config.receiptRoot,
      config.runtimeNamespace
    );
    const freshnessJournal = new EventReviewFreshnessJournal(config.journal);
    return Object.freeze({
      manifestBuilder: new ReviewInputManifestBuilder(),
      contractCompiler: new ReviewContractCompiler(new ReviewSlotSchemaCatalog()),
      receiptRecorder: new ReviewRuntimeReceiptRecorder(receiptStore),
      structuralValidator: new ReviewStructuralValidator(receiptStore),
      repairCoordinator: (keyOrRoundId: ReviewManifestKey | string, roundId?: string) => {
        const key =
          typeof keyOrRoundId === 'string'
            ? { mr: keyOrRoundId, headSHA: 'legacy', eventCursor: 'legacy' }
            : keyOrRoundId;
        return new ReviewRepairCoordinator(
          new EventReviewRepairJournal(
            config.journal,
            key,
            roundId ?? (typeof keyOrRoundId === 'string' ? keyOrRoundId : 'round')
          )
        );
      },
      freshnessGate: new ReviewFreshnessGate(freshnessJournal, (_purpose, _key) => ({
        actionCapabilities: Object.freeze({}),
        capabilityVersion: 'review-capabilities-v0',
        dispatchPolicy: { kind: 'RECONCILE_AFTER_EFFECT' },
      })),
      orchestrator: new ReviewOrchestrator(),
      synthesis: new ReviewSynthesis(),
      effectCoordinator: config.vcs
        ? new ReviewEffectCoordinator(config.vcs, config.journal, new ReviewActionCatalog())
        : null,
    });
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
    const reportDir = mrReportsDir(this._stateDir, this._reportRef(mr));
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
    if (!this._controlPlane) return this._materializeReview(mr, options);
    if (!options.controlPlaneInput) {
      throw new Error('[PipelineRuntime#startReview] Exact control-plane input is required');
    }
    if (options.controlPlaneInput.intent.manifestKey.mr !== mr) {
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
    if (!this._controlPlane || !this._controlJournal) {
      throw new Error('[PipelineRuntime#_executeControlPlaneReview] Control plane is unavailable');
    }
    const prepared = await this.prepareControlPlaneReview(input.intent, input.capture);
    if (prepared.manifest.status !== 'SEALED' || prepared.contract?.status !== 'COMPILED') {
      throw new Error('[PipelineRuntime#_executeControlPlaneReview] Manifest or contract BLOCKED');
    }
    const manifest = prepared.manifest;
    const contract = prepared.contract;
    if (!this._stateDir || !this._opencode) {
      throw new Error(
        '[PipelineRuntime#_executeControlPlaneReview] Actual agent runtime evidence is required'
      );
    }
    const reportDir = mrReportsDir(this._stateDir, this._reportRef(input.intent.manifestKey.mr));
    const controlDir = join(reportDir, 'control-plane');
    await mkdir(controlDir, { recursive: true });
    await this._writeArtifact(
      controlDir,
      'manifest.json',
      manifest as unknown as Record<string, unknown>
    );
    const artifacts: ReviewArtifact[] = [];
    const evidence: ReviewEvidence[] = [];
    let sequence = 0;
    const execution = await this._controlPlane.orchestrator.execute(contract, async (slotId) => {
      const slot = contract.slots.find((candidate) => candidate.slotId === slotId);
      if (!slot) return { status: 'FAILED' as const, provenance: ['missing-contract-slot'] };
      const mappedSourceId = contract.inputMappings.find((mapping) =>
        mapping.targetSlotIds?.includes(slotId)
      )?.inputId;
      const dimensionSourceId = slotId.startsWith('dimension:')
        ? `source:${slotId.slice('dimension:'.length)}`
        : slotId === 'lens:general'
          ? 'source:review-lens'
          : undefined;
      const source =
        manifest.inputs.find(
          (candidate) => candidate.inputId === (mappedSourceId ?? dimensionSourceId)
        ) ?? manifest.inputs[0];
      if (!source) return { status: 'FAILED' as const, provenance: ['mapped-source-missing'] };
      const sourceTarget = `control-plane/sources/${createHash('sha256').update(source.inputId).digest('hex')}.txt`;
      const observedSourceBytes = source.capturedBytes ?? source.digest;
      await this._writeArtifactBytes(reportDir, sourceTarget, observedSourceBytes);
      const operationTitle = `pipeline_control_slot_${createHash('sha256').update(source.inputId).digest('hex')}`;
      const session = await this._opencode!.createSession({
        title: operationTitle,
        directory: reportDir,
        tools: { read: true, grep: true },
        model: this._controlPlaneModel,
      });
      const result = await this._opencode!.prompt(session.sid, {
        system:
          `Execute one review contract slot. First read ${sourceTarget} with the read tool. ` +
          `Then return one JSON object with exactly these three top-level keys and no markdown: ` +
          `{"sourceId":${JSON.stringify(source.inputId)},"content":"concise grounded conclusion","fields":{${slot.requiredFields
            .map((field) => `${JSON.stringify(field)}:"grounded value or explicitly unavailable"`)
            .join(',')}}}. ` +
          `Do not return slotId, kind, evidence, groundedSourceContent, or any other top-level key. ` +
          `Do not invent facts absent from the immutable source.`,
        text: JSON.stringify({
          slotId: slot.slotId,
          kind: slot.kind,
          requiredFields: slot.requiredFields,
          sourceAnchors: slot.sourceAnchors,
          sourceId: source.inputId,
          sourceTarget,
        }),
        format: {
          type: 'json_schema',
          schema: {
            title: 'pipeline_control_slot',
            type: 'object',
            required: ['sourceId', 'content', 'fields'],
            properties: {
              sourceId: { type: 'string' },
              content: { type: 'string' },
              fields: { type: 'object' },
            },
          },
        },
      });
      if (!result.ok && result.error.details?.retryable === false) {
        await this._opencode!.close(session.sid);
        const error = new Error(
          `[PipelineRuntime#_executeControlPlaneReview] Non-retryable ${result.error.class} for ${this._controlPlaneModel ?? 'server-default'}: ${result.error.signal ?? 'No provider diagnostic'}`,
          { cause: result.error }
        );
        logger.error('[PipelineRuntime#_executeControlPlaneReview] [executing → provider_failed]', {
          mr: input.intent.manifestKey.mr,
          slotId,
          sourceId: source.inputId,
          sessionId: session.sid,
          model: this._controlPlaneModel ?? 'server-default',
          provider: result.error.details?.providerID,
          modelID: result.error.details?.modelID,
          statusCode: result.error.details?.statusCode,
          retryable: result.error.details?.retryable,
          error,
        });
        throw error;
      }
      if (!result.ok) {
        logger.warn('[PipelineRuntime#_executeControlPlaneReview] [executing → slot_failed]', {
          mr: input.intent.manifestKey.mr,
          slotId,
          sourceId: source.inputId,
          sessionId: session.sid,
          model: this._controlPlaneModel ?? 'server-default',
          outcome: result.error.class,
          signal: result.error.signal,
          retryable: result.error.details?.retryable,
        });
      }
      const calls = await this._opencode!.toolCalls(session.sid);
      const trace = await this._opencode!.toolCallTrace(session.sid);
      await this._opencode!.close(session.sid);
      if (!result.ok || calls.length === 0 || trace.length === 0) {
        return { status: 'FAILED' as const, provenance: ['agent-output-or-tool-receipt-missing'] };
      }
      const content = typeof result.output.content === 'string' ? result.output.content.trim() : '';
      const fields =
        result.output.fields && typeof result.output.fields === 'object'
          ? (result.output.fields as Record<string, unknown>)
          : {};
      if (
        !content ||
        slot.requiredFields.some((field) => !(field in fields)) ||
        !calls.some((call) => call.tool === 'read' && call.path.endsWith(sourceTarget)) ||
        !trace.some(
          (entry) =>
            entry.tool === 'read' &&
            entry.input.endsWith(sourceTarget) &&
            entry.status === 'completed'
        )
      ) {
        return { status: 'FAILED' as const, provenance: ['agent-evidence-invalid'] };
      }
      sequence += 1;
      const recorded = await this._controlPlane!.receiptRecorder.recordTrustedOperation(
        {
          namespace: this._runtimeNamespace(),
          contractId: contract.contractId,
          manifestKeyDigest: contract.manifestKeyDigest,
          contractVersion: contract.contractVersion,
          sessionId: session.sid,
          taskId: `slot:${slotId}`,
          nextSequence: sequence,
        },
        async () => {
          const observedBytes = await readFile(join(reportDir, sourceTarget), 'utf8');
          const observedSourceDigest = createHash('sha256').update(observedBytes).digest('hex');
          if (observedSourceDigest !== source.digest) {
            throw new Error(
              '[PipelineRuntime#_executeControlPlaneReview] Observed source digest mismatch'
            );
          }
          return {
            sourceId: source.inputId,
            sourceVersion: source.version,
            sourceDigest: observedSourceDigest,
            targetId: sourceTarget,
            operation: 'READ' as const,
            normalizedArguments: {
              path: sourceTarget,
              toolCalls: JSON.stringify(calls),
              trace: JSON.stringify(trace),
            },
            semanticAnchor: source.canonicalIdentity,
            content: observedBytes,
            outcome: trace.map((entry) => ({
              seq: entry.seq,
              tool: entry.tool,
              status: entry.status,
              outputBytes: entry.outputBytes ?? 0,
            })),
            status: 'SUCCEEDED' as const,
            observedAt: new Date().toISOString(),
          };
        }
      );
      if (recorded.status !== 'ELIGIBLE') {
        return { status: 'FAILED' as const, provenance: [`receipt-rejected:${recorded.reason}`] };
      }
      const artifactId = `artifact:${contract.contractId}:${slotId}`;
      const fragmentId = `fragment:${contract.contractId}:${slotId}`;
      artifacts.push({
        artifactId,
        revision: 1,
        manifestRef: manifest.ref,
        contractId: contract.contractId,
        contractVersion: contract.contractVersion,
        producerSessionId: session.sid,
        producerModel: 'opencode-control-plane',
        fragments: [
          {
            fragmentId,
            slotId,
            anchor: source.canonicalIdentity,
            content,
            fields,
          },
        ],
        createdAt: new Date().toISOString(),
      });
      evidence.push({
        evidenceId: `evidence:${contract.contractId}:${slotId}`,
        slotId,
        contractId: contract.contractId,
        contractVersion: contract.contractVersion,
        manifestRef: manifest.ref,
        sourceId: source.inputId,
        sourceVersion: source.version,
        sourceDigest: source.digest,
        artifactId,
        artifactRevision: 1,
        fragmentId,
        producerSessionId: session.sid,
        producerModel: 'opencode-control-plane',
        producedAt: new Date().toISOString(),
        receiptIds: [recorded.receipt.receiptId],
        reuseConsumptionIds: [],
        fields,
      });
      return { status: 'COMPLETE' as const, provenance: [recorded.durableDigest] };
    });
    if (execution.status !== 'COMPLETED') {
      throw new Error('[PipelineRuntime#_executeControlPlaneReview] Slot execution BLOCKED');
    }
    await this._writeArtifact(controlDir, 'artifacts.json', { artifacts });
    await this._writeArtifact(controlDir, 'evidence.json', { evidence });
    const persistedArtifacts = JSON.parse(
      await readFile(join(controlDir, 'artifacts.json'), 'utf8')
    ) as {
      artifacts?: ReviewArtifact[];
    };
    const persistedEvidence = JSON.parse(
      await readFile(join(controlDir, 'evidence.json'), 'utf8')
    ) as {
      evidence?: ReviewEvidence[];
    };
    const verdict = this._controlPlane.structuralValidator.validate({
      manifest,
      contract,
      artifacts: persistedArtifacts.artifacts ?? [],
      evidence: persistedEvidence.evidence ?? [],
      storeContext: {
        namespace: this._runtimeNamespace(),
        contractId: contract.contractId,
        manifestKeyDigest: contract.manifestKeyDigest,
      },
      attempt: 0,
      maxAttempts: 3,
    });
    if (verdict.status !== 'PASS') {
      await this._controlPlane
        .repairCoordinator(input.intent.manifestKey, contract.contractId)
        .planTargetedRepair(contract, verdict);
      await this._controlJournal.append({
        ts: new Date().toISOString(),
        mr: input.intent.manifestKey.mr,
        kind: 'system',
        actor: 'review-control-plane',
        payload: { event: 'validation_terminal', status: verdict.status, verdict },
      });
      throw new Error('[PipelineRuntime#_executeControlPlaneReview] Structural validation BLOCKED');
    }
    const guardedVerdict = await this._controlPlane.freshnessGate.guard(
      'VERDICT',
      input.intent.manifestKey,
      () => this._manifestRevision(input.intent.manifestKey),
      () => verdict
    );
    if (guardedVerdict.status !== 'FRESH') {
      throw new Error(
        `[PipelineRuntime#_executeControlPlaneReview] Verdict ${guardedVerdict.status}`
      );
    }
    const synthesis = this._controlPlane.synthesis.construct(contract.ref, verdict, evidence, {
      facts: [`contract:${contract.contractId}`],
      risks: [],
      conflicts: [],
      recommendationInputs: [],
      provenance: execution.provenance,
    });
    if ('status' in synthesis) {
      throw new Error(`[PipelineRuntime#_executeControlPlaneReview] Synthesis ${synthesis.status}`);
    }
    const publication = await this._controlPlane.freshnessGate.guard(
      'SYNTHESIS_PUBLICATION',
      input.intent.manifestKey,
      () => this._manifestRevision(input.intent.manifestKey),
      async () => {
        await this._controlJournal!.append({
          ts: new Date().toISOString(),
          mr: input.intent.manifestKey.mr,
          kind: 'system',
          actor: 'review-control-plane',
          payload: { event: 'synthesis_terminal', status: 'PASS', synthesis },
        });
        return synthesis;
      }
    );
    if (publication.status !== 'FRESH') {
      throw new Error(
        `[PipelineRuntime#_executeControlPlaneReview] Publication ${publication.status}`
      );
    }
    return Object.freeze({ intent: input.intent, manifest, contract });
  }

  /**
   * @purpose Resolve the profile namespace owned by this runtime's receipt store.
   * @returns Exact namespace embedded in this runtime identity.
   */
  protected _runtimeNamespace(): string {
    const prefix = 'pipeline-runtime:';
    return this.identity.slice(prefix.length, this.identity.lastIndexOf(':'));
  }

  /**
   * @purpose Normalize one immutable manifest key into the freshness transaction revision.
   * @param key Exact observed MR key supplied by the control-plane caller.
   * @returns Canonical head and event cursor revision.
   */
  protected _manifestRevision(key: ReviewManifestKey): string {
    return `${key.headSHA}:${key.eventCursor}`;
  }

  /**
   * @purpose Materialize exact immutable source bytes for a callback-observed read operation.
   * @param reportDir Review report root owning the control-plane source namespace.
   * @param target Relative canonical operation target.
   * @param content Exact captured source bytes.
   * @returns Promise resolved after the source is atomically replaced.
   * @sideEffect Filesystem: writes one profile-scoped immutable source projection.
   */
  protected async _writeArtifactBytes(
    reportDir: string,
    target: string,
    content: string
  ): Promise<void> {
    const path = join(reportDir, target);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
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
    const role = options.role ?? 'reviewer';
    const plan = new PlanTemplate(new TriggerRegistry()).generate(mr, options.changeset ?? []);
    const plannedTracks = options.tracks?.length
      ? options.tracks
      : plan.tracks.map((track) => track.id);
    const tracks = options.controlPlaneInput
      ? [...new Set([...plannedTracks, 'control'])]
      : plannedTracks;
    const pipelineParams = {
      mr,
      createdBy: 'pipeline',
      changeset: options.changeset ?? [],
      toolTrace: options.toolTrace ?? [],
      modelResults: options.modelResults ?? [],
      plan,
      controlPlaneAuthorized: options.controlPlaneInput !== undefined,
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

    if (options.controlPlaneInput) {
      taskIds.push(
        await this._enqueue(mr, 'lens_control', {
          ...pipelineParams,
          layer: 'mandatory',
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
          diagrams: modelResult.diagrams ?? [],
          model: modelResult.model,
          runId: modelResult.runId,
        });
        await this._writeArtifactBytes(
          reportDir,
          `tasks/${task.type}.md`,
          modelResult.report ?? this._renderWorkerReport(task.type, files, modelResult.findings)
        );
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
          ...(synthesize.buildReviewJson(
            synthesized,
            modelResults.length > 0 ? modelResults : seededResults
          ) as ReviewJson),
          verdict: 'COMMENT',
        };
        await this._writeArtifact(reportDir, 'review.json', review);
        await this._writeArtifactBytes(
          reportDir,
          'REVIEW.md',
          this._renderSynthesisReport(
            review,
            modelResults.length > 0 ? modelResults : seededResults
          )
        );
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
          'Review the assigned MR scope. Return ONLY one ```json fenced code block matching the schema — no prose before or after. The report field must contain the complete human-readable Markdown result of this worker session: scope, reasoning summary, findings with evidence, and conclusion. When the scope provides evidence for them, diagrams must carry operator-facing change-map, C4, behaviour/data-flow, or use-case views of the MR itself — never a map of agent tracks. When no issue is found, explain what was checked and why the scope is clear.',
        text: `Worker ${task.type}; MR ${String(task.params.mr)}; files: ${files.join(', ') || '(no changed files)'} — read sources under ./worktree/ (repo checkout), prior-step artifacts under ./report/`,
        format: {
          type: 'json_schema',
          schema: {
            title,
            type: 'object',
            required: ['findings', 'report'],
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
                    diff: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['type', 'text'],
                        properties: {
                          type: { enum: ['context', 'add', 'remove'] },
                          num: { type: 'number' },
                          text: { type: 'string' },
                        },
                      },
                    },
                    factcheck: { enum: ['verified', 'pending', 'debunked'] },
                  },
                },
              },
              report: { type: 'string' },
              diagrams: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['kind', 'title', 'caption', 'nodes', 'edges'],
                  properties: {
                    kind: { enum: ['change-map', 'c4', 'behaviour', 'use-cases'] },
                    title: { type: 'string' },
                    caption: { type: 'string' },
                    nodes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['id', 'label'],
                        properties: {
                          id: { type: 'string' },
                          label: { type: 'string' },
                          detail: { type: 'string' },
                          tone: { type: 'string' },
                        },
                      },
                    },
                    edges: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['from', 'to'],
                        properties: {
                          from: { type: 'string' },
                          to: { type: 'string' },
                          label: { type: 'string' },
                        },
                      },
                    },
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
      const diagrams = this._parseDiagrams(result.output.diagrams, task.type);
      const sessionReport =
        typeof result.output.report === 'string' ? result.output.report.trim() : '';
      const report = sessionReport || this._renderWorkerReport(task.type, files, findings);
      const calls = await this._opencode.toolCalls(session.sid);
      await this._appendToolTrace(reportDir, calls);
      this._rememberWorkerSession(String(task.params.mr), {
        sid: session.sid,
        taskType: task.type,
      });
      return {
        track: task.type,
        model: `opencode-${task.type}`,
        runId: session.sid,
        findings,
        report,
        diagrams,
      };
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
        diff?: Array<{ type: 'context' | 'add' | 'remove'; num?: number; text: string }>;
        factcheck?: 'verified' | 'pending' | 'debunked';
      };
      const diff = Array.isArray(finding.diff)
        ? finding.diff.filter(
            (line) =>
              !!line &&
              ['context', 'add', 'remove'].includes(line.type) &&
              typeof line.text === 'string'
          )
        : undefined;
      const factcheck = ['verified', 'pending', 'debunked'].includes(String(finding.factcheck))
        ? finding.factcheck
        : undefined;
      return { ...finding, diff, factcheck };
    });
  }

  /**
   * @purpose Validate optional structured diagram projections before durable synthesis.
   * @param value Raw structured output field from the worker.
   * @param taskType Concrete worker type used in failure context.
   * @returns Valid diagram projections, or an empty array when absent.
   */
  protected _parseDiagrams(value: unknown, taskType: string): ModelResult['diagrams'] {
    if (value === undefined) return [];
    if (!Array.isArray(value))
      throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagrams`);
    return value.map((candidate) => {
      if (!candidate || typeof candidate !== 'object')
        throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagram`);
      const diagram = candidate as NonNullable<ModelResult['diagrams']>[number];
      if (
        !['change-map', 'c4', 'behaviour', 'use-cases'].includes(diagram.kind) ||
        typeof diagram.title !== 'string' ||
        typeof diagram.caption !== 'string' ||
        !Array.isArray(diagram.nodes) ||
        !Array.isArray(diagram.edges) ||
        diagram.nodes.some(
          (node) => !node || typeof node.id !== 'string' || typeof node.label !== 'string'
        ) ||
        diagram.edges.some(
          (edge) => !edge || typeof edge.from !== 'string' || typeof edge.to !== 'string'
        )
      )
        throw new Error(`[PipelineRuntime#_parseDiagrams] ${taskType} returned invalid diagram`);
      return diagram;
    });
  }

  /**
   * @purpose Render a durable readable fallback for seeded/legacy workers without prose output.
   * @param taskType Concrete worker type for the fallback header.
   * @param files Files implicated by the findings.
   * @param findings Findings to render as markdown lines.
   * @returns Readable markdown report.
   */
  protected _renderWorkerReport(
    taskType: string,
    files: string[],
    findings: ModelResult['findings']
  ): string {
    const findingLines = findings.length
      ? findings.map(
          (finding) =>
            `- **${finding.severity.toUpperCase()}** \`${finding.file}:${finding.line}\` — ${finding.summary}`
        )
      : ['- Замечаний, требующих публикации, не найдено.'];
    return [
      `# ${taskType.replaceAll('_', ' ')}`,
      '',
      '## Проверенный scope',
      '',
      ...(files.length ? files.map((file) => `- \`${file}\``) : ['- Нет применимых файлов']),
      '',
      '## Находки',
      '',
      ...findingLines,
      '',
    ].join('\n');
  }

  /**
   * @purpose Materialize the final synthesized review as the primary human-readable artifact.
   * @param review Final synthesized review JSON.
   * @param modelResults Model results whose report is being rendered.
   * @returns Human-readable markdown artifact body.
   */
  protected _renderSynthesisReport(review: ReviewJson, modelResults: ModelResult[]): string {
    const findings = Array.isArray(review.findings) ? review.findings : [];
    const findingLines = findings.length
      ? findings.map((finding, index) => {
          const item = finding as unknown as Record<string, unknown>;
          const location = [item.file, item.line].filter((value) => value !== undefined).join(':');
          return `${index + 1}. **${String(item.severity ?? 'info').toUpperCase()}**${location ? ` \`${location}\`` : ''} — ${String(item.summary ?? 'Без описания')}`;
        })
      : ['Замечаний, требующих публикации, не найдено.'];
    return [
      '# Итог ревью',
      '',
      `> Вердикт: **${String(review.verdict ?? 'COMMENT')}** · ревизия ${String(review.revision ?? 1)}`,
      '',
      '## Синтезированные находки',
      '',
      ...findingLines,
      '',
      '## Результаты дорожек',
      '',
      ...modelResults.map(
        (result) =>
          `- [${result.track.replaceAll('_', ' ')}](tasks/${result.track}.md) — ${result.findings.length} находок · сессия \`${result.runId}\``
      ),
      '',
    ].join('\n');
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
    if (mr.includes('!')) {
      const [project, iid] = mr.split('!');
      const segments = project.replace(/^https?:\/\//, '').split('/');
      if (segments.length > 1 && segments[0].includes('.')) segments.shift();
      return `${segments.join('/')}!${iid}`;
    }
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
