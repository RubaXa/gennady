// @file: MutationRuntime — executor-owned consumer for queued artifact mutations.
// @consumers: HttpServer, MutateRouter
// @tasks: TSK-163

import type { JournalPort } from '../inbox-core/event-journal.ts';
import { Executor } from '../inbox-queue/executor.ts';
import type { TaskQueuePort } from '../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../inbox-queue/task-registry.ts';
import type { SessionRouterPort } from '../inbox-queue/session-router.ts';
import type { MutationProposal } from './types.ts';
import { MutationApplier, type ApplyResult } from './mutation-applier.ts';

/** @purpose Result produced only after the queue executor owns the complete mutation lifecycle. */
export type MutationRuntimeResult = {
  /** @purpose Queue task that was materialized from the HTTP proposal. */
  taskId: string;
  /** @purpose CAS application outcome. */
  result: ApplyResult;
};

/**
 * @purpose Consume `mutate_artifact` through the same durable Executor and producer-session
 * routing used by the live runtime.
 * @invariant HTTP can submit a proposal but never transitions/apply-writes a mutation itself.
 */
export class MutationRuntime {
  /** @purpose Sole CAS writer and durable snapshot owner for review artifacts. */
  protected _applier: MutationApplier;
  /** @purpose Shared MR queue observed by the executor and API projections. */
  protected _queue: TaskQueuePort;
  /** @purpose Durable task lifecycle journal. */
  protected _journal: JournalPort;
  /** @purpose Immutable task definition registry used by each MR executor. */
  protected _registry: TaskRegistry;
  /** @purpose Optional producer-session routing seam for live serve. */
  protected _sessionRouter?: SessionRouterPort;
  /** @purpose Durable executor instances keyed by canonical MR reference. */
  protected _executors = new Map<string, Executor>();

  /**
   * @purpose Construct one executor-backed mutation consumer.
   * @param deps Shared queue, journal, CAS writer, proposal flow and optional producer router.
   */
  constructor(deps: {
    applier: MutationApplier;
    queue: TaskQueuePort;
    journal: JournalPort;
    registry?: TaskRegistry;
    sessionRouter?: SessionRouterPort;
  }) {
    this._applier = deps.applier;
    this._queue = deps.queue;
    this._journal = deps.journal;
    this._registry = deps.registry ?? new TaskRegistry();
    this._sessionRouter = deps.sessionRouter;
  }

  /**
   * @purpose Materialize and consume one operator proposal through queue → SessionRouter →
   * MutationApplier. The durable Executor owns task status and its journal events.
   * @param mr Canonical MR reference owning the proposal.
   * @param proposal Explicit operator-approved artifact mutation.
   * @param revision Caller-observed CAS revision.
   * @returns Queue identity and the completed CAS outcome.
   */
  async submit(
    mr: string,
    proposal: MutationProposal,
    revision: number
  ): Promise<MutationRuntimeResult> {
    const executor = this._executorFor(mr);
    // `MutationFlow#propose` is the internal port kept for non-runtime callers. Live HTTP work
    // must enter through Executor#enqueue: task_created is the recovery boundary, so a process
    // crash between acceptance and advance cannot erase an operator-approved mutation.
    const { taskId } = await executor.enqueue('mutate_artifact', {
      anchor: { widgetId: 'review', elementId: proposal.target },
      intent: `Apply ${proposal.op} to ${proposal.target}`,
      proposal,
      revision,
      createdBy: 'operator',
    });
    const started = await executor.advance();
    const task = started.find((candidate) => candidate.taskId === taskId);
    if (!task) throw new Error(`[MutationRuntime#submit] Task did not start: ${taskId}`);

    return this._consume(mr, executor, taskId, proposal, revision);
  }

  /**
   * @purpose Rebuild one MR queue from durable `task_created`/`task_status` events and consume
   * incomplete mutation work after a process restart.
   * @param mr Canonical MR reference whose executor is being recovered.
   * @returns Outcomes for every mutation that was resumed in this pass.
   */
  async recover(mr: string): Promise<MutationRuntimeResult[]> {
    const executor = this._executorFor(mr);
    executor.recover();
    const started = await executor.advance();
    const results: MutationRuntimeResult[] = [];
    for (const task of started) {
      if (task.type !== 'mutate_artifact') continue;
      const proposal = task.params.proposal as MutationProposal | undefined;
      const revision = task.params.revision;
      if (!proposal || typeof revision !== 'number') {
        await executor.fail(task.taskId, 'Mutation task lacks durable proposal or revision');
        continue;
      }
      results.push(await this._consume(mr, executor, task.taskId, proposal, revision));
    }
    return results;
  }

  /**
   * @purpose Resume every MR that has ever journaled a durable mutation task before the production
   * HTTP surface accepts more work.
   * @invariant Recovery discovers MR ownership solely from the shared append-only journal; callers
   *   never need a manual per-MR recovery seam after a process restart.
   * @returns Outcomes for all mutation tasks resumed during boot.
   */
  async recoverAll(): Promise<MutationRuntimeResult[]> {
    const mrs = new Set(
      this._journal
        .read()
        .filter(
          (entry) =>
            entry.kind === 'task_created' &&
            entry.payload?.type === 'mutate_artifact' &&
            entry.mr !== 'system'
        )
        .map((entry) => entry.mr)
    );
    const results: MutationRuntimeResult[] = [];
    for (const mr of mrs) results.push(...(await this.recover(mr)));
    return results;
  }

  /**
   * @purpose Route and apply a mutation only after the Executor has durably marked it running.
   * @param mr Canonical MR reference.
   * @param executor Durable task lifecycle owner.
   * @param taskId Started mutation task identity.
   * @param proposal Persisted operator-approved mutation proposal.
   * @param revision Persisted CAS revision.
   * @returns Completed task identity and CAS result.
   */
  protected async _consume(
    mr: string,
    executor: Executor,
    taskId: string,
    proposal: MutationProposal,
    revision: number
  ): Promise<MutationRuntimeResult> {
    const task = executor.state().find((candidate) => candidate.taskId === taskId);
    if (!task || task.status !== 'running') {
      throw new Error(`[MutationRuntime#_consume] Task is not running: ${taskId}`);
    }
    try {
      // SessionRouter is the producer ownership seam. Its side effect is intentionally awaited
      // before the sole writer starts the CAS transition.
      await this._sessionRouter?.route(task, mr);
      const result = await this._applier.apply(proposal, { mrRef: mr, revision });
      if (result.ok) await executor.complete(taskId);
      else await executor.fail(taskId, result.detail);
      return { taskId, result };
    } catch (cause) {
      await executor.fail(taskId, cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
  }

  /**
   * @purpose Restore an applied mutation using MutationApplier's durable per-MR snapshot.
   * @param mr Canonical MR reference owning the snapshot.
   * @param snapshotId Durable snapshot selected by the operator.
   * @returns The persisted undo outcome.
   */
  async undo(
    mr: string,
    snapshotId: string
  ): Promise<Awaited<ReturnType<MutationApplier['undo']>>> {
    return this._applier.undo({ mrRef: mr, snapshotId });
  }

  /**
   * @purpose Return the single durable executor bound to an MR.
   * @param mr Canonical MR reference.
   * @returns Existing or newly constructed MR executor.
   */
  protected _executorFor(mr: string): Executor {
    const existing = this._executors.get(mr);
    if (existing) return existing;
    const executor = new Executor(this._journal, this._registry, this._queue, mr);
    this._executors.set(mr, executor);
    return executor;
  }
}
