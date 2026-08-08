// @file: RoleScheduler — orchestrates tick (poll → delta → assign → step → escalate) and manual assignment.
// @consumers: serve timer, inbox-api
// @tasks: TSK-113, TSK-121, TSK-140, TSK-141, TSK-157, TSK-161

import { logger } from '#logger';
import type { RoleEngine, RegisteredRole } from './role-engine.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort } from '../inbox-opencode/opencode.port.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { PipelineRuntime } from '../inbox-pipeline/pipeline-runtime.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import type { InboxRegistry } from '../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';
import { isValidMrUrl } from '../inbox-core/vcs-validators.ts';
import { parseVcsUrl } from '../../../vcs-client/parse-vcs-url.ts';
import { RoleInstance, type RoleInstanceCheckpoint } from './role-instance.ts';
import { RightsEscalator } from './rights-escalator.ts';
import { buildNodeContext, fetchDiffRefsLive, type ContextBuilderDeps } from './context-builder.ts';
import { detectMrEvents, DebounceTracker } from './mr-watch.ts';
import {
  scanReportsDir,
  scanCurrentReportsDir,
  reconcileActionable,
  recoverLegacyArtifact,
  readCanonicalReview,
  buildResumeCheckpoint,
  legacyReportDir,
  type ReconciliationPlan,
  type MrReconciliation,
} from './artifact-recovery.ts';
// AI-02 noise filter — reused from the CLI pipeline per SV-12 (functions, not spawn).
// Debt: move classify/build-view into inbox-core alongside the TSK-109 migration.
import { classifyInbox } from '../../../../cli/cmd/inbox/_core/logic/classify-inbox.logic.ts';
import { buildInboxView } from '../../../../cli/cmd/inbox/_core/logic/build-inbox-view.logic.ts';
import { mrKey, mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { MrStage } from '../../../../cli/cmd/inbox/_core/logic/classify-mr-stage.logic.ts';
import type { RoleGraph } from './role-node.ts';

/**
 * @purpose Snapshot of a role instance for external consumers (e.g. BoardProviderReal).
 * @consumer BoardProviderReal
 */
export type RoleInstanceSnapshot = {
  /** @purpose Composite key: role:mrWebUrl */
  key: string;
  /** @purpose Role name */
  role: string;
  /** @purpose MR web URL */
  mr: string;
  /** @purpose Current lifecycle state */
  state: string;
  /** @purpose Current graph node id */
  currentNode: string;
  /** @purpose Findings / report from last AI node */
  findings: Array<{ severity: string; file: string; line: number; message: string }>;
  /** @purpose Final verdict if done */
  verdict: string;
  /** @purpose Whether operator attention is needed */
  awaitingOperator: boolean;
};

/**
 * @purpose Configuration for the role scheduler.
 * @consumer RoleScheduler
 */
export type RoleSchedulerConfig = {
  /** @purpose Role engine providing role definitions */
  engine: RoleEngine;
  /** @purpose State store for audit and registry */
  store: StateStore;
  /** @purpose VCS adapter for fetching MRs */
  vcs: VcsInboxPort;
  /** @purpose OpenCode adapter for AI-nodes */
  opencode: OpenCodePort;
  /** @purpose Polling interval in ms | @default 300000 (5 min) */
  pollingInterval?: number;
  /** @purpose Max active instances overall | @default 3 */
  maxInstances?: number;
  /**
   * @purpose Opt-in: build a live NodeContext (worktree/changeset/base/stage/headChanged) at
   *   assignment time instead of the legacy empty-artifacts start. | @default false
   * @invariant Off by default so existing VcsInboxMock-based tests keep their zero-network
   *   behavior; production bootstrap (TSK-121 P3) turns this on explicitly.
   */
  buildLiveContext?: boolean;
  /** @purpose Override for diff_refs resolution — injectable for tests; defaults to `fetchDiffRefsLive` when `buildLiveContext` is on */
  fetchDiffRefs?: ContextBuilderDeps['fetchDiffRefs'];
  /**
   * @purpose Forwarded to every RoleInstance's effect nodes — suppresses the real vcs-* mutation
   *   under INBOX_DRY_RUN (TSK-131); default false, dry-run is opt-in.
   */
  dryRun?: boolean;
  /**
   * @purpose Bounded pool for a role instance's `ParallelNode` lens sessions (TSK-perf) — forwarded
   *   to every constructed `RoleInstance`. @invariant Optional: absent → instances fall back to
   *   unbounded per-lens sessions directly against `opencode` (see RoleInstance's own invariant).
   */
  reviewSessionPool?: SessionPool;
  /**
   * @purpose Shared pipeline entrypoint owned by serve bootstrap.
   * @invariant Role pickup and a newly observed head both materialize work in this same queue.
   */
  pipeline?: PipelineRuntime;
};

/**
 * @purpose Orchestrates role execution: tick loop, assignment, instance management.
 * @invariant One MR = at most one active RoleInstance. Tick does not overlap.
 * @invariant Postcondition (tick): all new MRs assigned to matching active roles;
 *   instances with delta updates are refreshed; active instances are advanced.
 * @consumer Serve timer, inbox-api
 */
export class RoleScheduler {
  /** @purpose Scheduler configuration */
  protected _config: RoleSchedulerConfig;
  /** @purpose Active role instances keyed by `${roleName}:${mrWebUrl}` */
  protected _instances: Map<string, RoleInstance>;
  /** @purpose Whether a tick is currently in progress */
  protected _ticking: boolean;
  /** @purpose Whether the scheduler has been stopped — blocks new ticks */
  protected _stopped: boolean;
  /** @purpose Per-instance consecutive error count — for retry limits (F2) */
  protected _errorCount: Map<string, number>;
  /** @purpose Per-instance cooldown timestamp (epoch ms) — pause after N errors (F2) */
  protected _pausedUntil: Map<string, number>;
  /** @purpose Actionable MRs from the last poll, keyed by webUrl — source for unassigned (F7) */
  protected _lastPolled: Map<string, VcsActionableMr>;
  /** @purpose Notifies the operator on AWAITING_OPERATOR + reminds on idle (TSK-113 P3 wiring) */
  protected _rightsEscalator: RightsEscalator;
  /** @purpose Whether `advanceInstances` is currently running — guards against overlap with `tick`. */
  protected _advancing: boolean;

  /** @purpose Max consecutive errors before pausing an instance (F2) */
  private static readonly MAX_ERRORS = 3;
  /** @purpose Cooldown duration in ms after exceeding error threshold (F2) */
  private static readonly COOLDOWN_MS = 60_000;

  /**
   * @purpose Create a scheduler bound to an engine, store, VCS, and OpenCode adapter.
   * @param config Required configuration: engine, store, vcs, opencode.
   */
  constructor(config: RoleSchedulerConfig) {
    this._config = config;
    this._instances = new Map();
    this._ticking = false;
    this._stopped = false;
    this._errorCount = new Map();
    this._pausedUntil = new Map();
    this._lastPolled = new Map();
    this._rightsEscalator = new RightsEscalator({ store: config.store });
    this._advancing = false;
  }

  /**
   * @purpose Key for the instances map — composite of role and MR.
   * @param role Role name.
   * @param mrWebUrl MR web URL.
   * @returns Instance key string.
   */
  protected _instanceKey(role: string, mrWebUrl: string): string {
    return `${role}:${mrWebUrl}`;
  }

  /**
   * @purpose Derive the durable MR identity shared by pipeline tasks, proposal journals and capability cache.
   * @param mr Actionable VCS MR carrying authoritative project and IID fields.
   * @returns Canonical `project!iid` reference, never the transport-only web URL.
   */
  protected _canonicalMrRef(mr: VcsActionableMr): string {
    return `${mr.project}!${mr.iid}`;
  }

  /**
   * @purpose Execute one full tick: poll VCS, compute delta, assign/update instances, advance active.
   * @invariant Tick is mutually exclusive — concurrent ticks are skipped.
   * @returns Promise that resolves when the tick completes.
   */
  async tick(): Promise<void> {
    if (this._stopped) {
      logger.debug('[RoleScheduler#tick] [idle → skipped] Scheduler stopped');
      return;
    }

    if (this._ticking) {
      logger.debug('[RoleScheduler#tick] [idle → skipped] Tick already in progress');
      return;
    }

    this._ticking = true;
    logger.debug('[RoleScheduler#tick] [idle → ticking]');

    try {
      // #region START_POLL_VCS
      // F7: poll VCS regardless of role activation — MRs without an instance
      // must reach the dashboard as unassigned (SV-06 «БЕЗ РОЛИ», SV-08 manual assign).
      const activeRoles = this._config.engine.list().filter((r) => r.active);

      const rawMrs = await this._config.vcs.getActionable();
      const registry = this._config.store.loadRegistry();
      const mrs = await this._filterActionable(rawMrs, registry);
      this._lastPolled = new Map(mrs.map((mr) => [mr.webUrl, mr]));
      logger.debug('[RoleScheduler#tick] [ticking → polled]', {
        rawCount: rawMrs.length,
        mrCount: mrs.length,
        activeRoles: activeRoles.length,
      });
      // #endregion END_POLL_VCS

      // Restore what the operator assigned before the last restart (SV-08). Instances are in-memory
      // only, so without this an assigned MR came back as "без роли" after every restart — and role
      // activation does not help, since roles boot inactive and auto-assign is gated on that.
      await this._restoreAssignedInstances(registry);

      // #region START_ASSIGN_NEW_MRS — invariant: disk reconciliation (SV-15..SV-18) replaces the
      // old blind `!existingInstance` recreate; `_assignRole` resumes from a canonical/legacy
      // snapshot when one exists, falling through to the from-zero path otherwise.
      const diskSnapshots = [
        ...scanReportsDir(this._config.store.getStateDir()),
        ...scanCurrentReportsDir(this._config.store.getStateDir()),
      ];
      const reconciliation: ReconciliationPlan = reconcileActionable(diskSnapshots, mrs);
      const reconciliationByUrl = new Map(reconciliation.map((r) => [r.mr.webUrl, r]));

      for (const mr of mrs) {
        const existing = registry.entries[mr.webUrl];
        const isNew = !existing;

        // The VCS detail head and registry's accepted SHA form the production new-commit seam.
        const lastReviewedHeadSha = existing?.lastReviewedHeadSha;
        if (
          mr.role !== null &&
          mr.headSha &&
          lastReviewedHeadSha &&
          mr.headSha !== lastReviewedHeadSha
        ) {
          await this._config.pipeline?.startDeltaReview(
            this._canonicalMrRef(mr),
            lastReviewedHeadSha,
            mr.headSha
          );
        }

        for (const role of activeRoles) {
          const key = this._instanceKey(role.name, mr.webUrl);
          const existingInstance = this._instances.get(key);

          if (!existingInstance && this._shouldAssignRole(mr, role)) {
            await this._assignRole(mr, role, key, isNew, reconciliationByUrl.get(mr.webUrl));
          }
        }
      }
      // #endregion END_ASSIGN_NEW_MRS

      await this.advanceInstances(registry);
    } finally {
      this._ticking = false;
      this._stopped = false;
      logger.debug('[RoleScheduler#tick] [ticking → idle]');
    }
  }

  /**
   * @purpose Step every live instance one graph node, decoupled from `tick`'s slow VCS poll.
   *   Called from `tick` and its own fast timer (serve.cmd.ts).
   * @invariant Self-guarding — a call already in progress is skipped, not queued.
   * @param [registry] Preloaded registry (tick already has one); loaded fresh when omitted.
   * @returns Promise that resolves when this pass over all instances completes.
   */
  async advanceInstances(registry?: InboxRegistry): Promise<void> {
    if (this._advancing) {
      logger.debug('[RoleScheduler#advanceInstances] [idle → skipped] Already in progress');
      return;
    }
    this._advancing = true;
    try {
      const effectiveRegistry = registry ?? this._config.store.loadRegistry();

      // #region START_ADVANCE_INSTANCES
      for (const [key, instance] of this._instances) {
        const pausedUntil = this._pausedUntil.get(key);
        if (pausedUntil !== undefined && Date.now() < pausedUntil) {
          continue;
        }

        if (
          instance.state === 'idle' ||
          instance.state === 'running' ||
          instance.state === 'awaiting_operator' ||
          instance.state === 'escalated'
        ) {
          // #region START_GATE_ON_MR_EVENTS — reviewer-only debounce gate (SV-19/20/21, live bug 2026-07-28: author self-review isn't a "wait for reply" conversation)
          if (
            instance.role === 'reviewer' &&
            instance.currentNode === 'node_prepare' &&
            this._config.buildLiveContext &&
            !(await this._shouldAdvanceInstance(instance, effectiveRegistry))
          ) {
            continue;
          }
          // #endregion END_GATE_ON_MR_EVENTS

          // 'escalated' keeps stepping — a fresh step() retries the failing node (pausedUntil above throttles it).
          await instance.step();

          // F2: Track errors — state may have changed to 'error'/'awaiting_operator'/'escalated' after step()
          const currentState: string = instance.state;
          if (
            currentState === 'error' ||
            currentState === 'awaiting_operator' ||
            currentState === 'escalated'
          ) {
            const count = (this._errorCount.get(key) ?? 0) + 1;
            this._errorCount.set(key, count);

            if (count >= RoleScheduler.MAX_ERRORS) {
              logger.warn(
                '[RoleScheduler#advanceInstances] [advancing → paused] Instance paused after N errors',
                {
                  mr: instance.mr,
                  role: instance.role,
                  errorCount: count,
                  reason: `Exceeded ${RoleScheduler.MAX_ERRORS} consecutive errors without progress`,
                }
              );
              this._pausedUntil.set(key, Date.now() + RoleScheduler.COOLDOWN_MS);
            }
          } else {
            // Progress was made — reset error count
            this._errorCount.delete(key);
          }
        }
      }
      // #endregion END_ADVANCE_INSTANCES

      // #region START_ESCALATE_AWAITING_OPERATOR — notify immediately + remind on idle (SV-notif)
      for (const [key, instance] of this._instances) {
        if (instance.state !== 'awaiting_operator') continue;

        try {
          await this._rightsEscalator.notifyReady(instance);
          await this._rightsEscalator.remindIdle(instance);
        } catch (error) {
          logger.warn('[RoleScheduler#advanceInstances] [advancing → escalation_failed]', {
            key,
            error: String(error),
          });
        }
      }
      // #endregion END_ESCALATE_AWAITING_OPERATOR

      // #region START_CLEANUP_DONE
      for (const [key, instance] of this._instances) {
        if (instance.state === 'done' || instance.state === 'error') {
          this._instances.delete(key);
          this._errorCount.delete(key);
          this._pausedUntil.delete(key);
          logger.debug('[RoleScheduler#advanceInstances] [advancing → cleaned]', {
            key,
            state: instance.state,
          });
        }
      }
      // #endregion END_CLEANUP_DONE
    } finally {
      this._advancing = false;
    }
  }

  /**
   * @purpose Manually assign a role to an MR — for operator-initiated processing.
   * @param mrUrl MR web URL to assign.
   * @param roleName Role name (e.g. 'reviewer', 'author').
   * @param [rights] Optional operational rights (e.g. { canPost: false }).
   * @returns Promise that resolves when assignment completes.
   */
  async assignManual(
    mrUrl: string,
    roleName: string,
    rights?: Record<string, unknown>
  ): Promise<void> {
    // #region START_VALIDATE_MR_URL — prevent SSRF: only allow URLs matching our VCS host
    const vcsHost = this._config.vcs.getHost();
    if (!isValidMrUrl(mrUrl, vcsHost)) {
      logger.warn('[RoleScheduler#assignManual] [assigning → invalid_url]', { mrUrl, vcsHost });
      return;
    }
    // #endregion END_VALIDATE_MR_URL

    logger.info('[RoleScheduler#assignManual] [idle → assigning]', { role: roleName, mr: mrUrl });

    const definition = this._config.engine.retrieve(roleName);
    if (!definition) {
      logger.warn('[RoleScheduler#assignManual] [assigning → role_not_found]', { role: roleName });
      return;
    }

    // SV-08: manual assignment is the operator's explicit decision — role activation
    // gates only auto-assignment (SV-07), not manual.
    if (!this._config.engine.isActive(roleName)) {
      logger.info('[RoleScheduler#assignManual] [assigning → inactive_role_manual]', {
        role: roleName,
      });
    }

    const key = this._instanceKey(roleName, mrUrl);
    if (this._instances.has(key)) {
      logger.debug('[RoleScheduler#assignManual] [assigning → already_assigned]', { key });
      return;
    }

    const checkpoint =
      (await this._tryResumeFromDisk(mrUrl, definition.graph)) ??
      (await this._buildInitialCheckpoint(mrUrl, definition.graph));
    const instance = new RoleInstance({
      id: key,
      role: roleName,
      mr: mrUrl,
      graph: definition.graph,
      opencode: this._config.opencode,
      vcs: this._config.vcs,
      store: this._config.store,
      dryRun: this._config.dryRun ?? false,
      reviewSessionPool: this._config.reviewSessionPool,
      rights,
      checkpoint,
    });

    this._instances.set(key, instance);

    // Persist the operator's choice: instances live in memory only, so without this marker a
    // restart dropped the assignment and the MR reappeared as "без роли" (live bug, 2026-07-27).
    // Restored on the next tick by `_restoreAssignedInstances`, regardless of role activation.
    try {
      const parsed = parseVcsUrl(mrUrl);
      this._config.store.recordAssignment(
        mrUrl,
        roleName,
        parsed ? { project: parsed.repository, iid: String(parsed.iid) } : undefined
      );
    } catch (cause) {
      logger.warn('[RoleScheduler#assignManual] [assigned → persist_failed]', {
        key,
        error: (cause as Error).message,
      });
    }

    logger.info('[RoleScheduler#assignManual] [assigning → assigned]', { key });

    // Advance past node_prepare immediately — the SV-19/20/21 debounce gate
    // only applies at node_prepare, and the operator explicitly requested action.
    try {
      await instance.step();
    } catch (cause) {
      logger.warn('[RoleScheduler#assignManual] [assigned → step_failed]', {
        key,
        error: (cause as Error).message,
      });
    }
  }

  /**
   * @purpose Recreate instances for MRs the operator assigned before a restart (SV-08).
   * @invariant Independent of role activation (SV-08) — resumes from disk when a snapshot exists.
   * @param registry Loaded registry carrying `assignedRole` markers.
   * @returns Promise resolving once all pending assignments have instances.
   * @sideEffect Creates RoleInstances; drops markers whose role no longer exists.
   */
  protected async _restoreAssignedInstances(registry: InboxRegistry): Promise<void> {
    for (const [mrUrl, entry] of Object.entries(registry.entries)) {
      const roleName = entry.assignedRole;
      if (!roleName) continue;

      const key = this._instanceKey(roleName, mrUrl);
      if (this._instances.has(key)) continue;

      const definition = this._config.engine.retrieve(roleName);
      if (!definition) {
        this._config.store.clearAssignment(mrUrl);
        continue;
      }

      try {
        const checkpoint =
          (await this._tryResumeFromDisk(mrUrl, definition.graph)) ??
          (await this._buildInitialCheckpoint(mrUrl, definition.graph));
        this._instances.set(
          key,
          new RoleInstance({
            id: key,
            role: roleName,
            mr: mrUrl,
            graph: definition.graph,
            opencode: this._config.opencode,
            vcs: this._config.vcs,
            store: this._config.store,
            dryRun: this._config.dryRun ?? false,
            reviewSessionPool: this._config.reviewSessionPool,
            checkpoint,
          })
        );
        logger.info('[RoleScheduler#_restoreAssignedInstances] [ticking → restored]', { key });
      } catch (cause) {
        logger.warn('[RoleScheduler#_restoreAssignedInstances] [ticking → restore_failed]', {
          key,
          error: (cause as Error).message,
        });
      }
    }
  }

  /**
   * @purpose Count of active (non-terminal) instances.
   * @returns Number of active instances.
   */
  activeCount(): number {
    let count = 0;
    for (const instance of this._instances.values()) {
      if (instance.state !== 'done' && instance.state !== 'error') {
        count++;
      }
    }
    return count;
  }

  /**
   * @purpose Gracefully stop the scheduler — wait for in-flight tick, prevent new ticks.
   * @returns Promise that resolves when the scheduler is stopped.
   * @sideEffect Sets internal flag; resolves when any running tick completes.
   */
  async stop(): Promise<void> {
    this._stopped = true;
    // Wait for any in-flight tick to complete
    let waited = 0;
    while (this._ticking && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    logger.info('[RoleScheduler#stop] [running → stopped]');
  }

  /**
   * @purpose List all instance snapshots for BoardProviderReal consumption.
   * @returns Array of instance snapshots with role, mr, state, node, and findings.
   * @consumer BoardProviderReal
   */
  listInstances(): RoleInstanceSnapshot[] {
    const snapshots: RoleInstanceSnapshot[] = [];
    for (const [key, instance] of this._instances) {
      const view = instance.getBoardView() as Record<string, unknown>;
      snapshots.push({
        key,
        role: instance.role,
        mr: instance.mr,
        state: instance.state,
        currentNode: instance.currentNode,
        findings: (view.findings as RoleInstanceSnapshot['findings']) ?? [],
        verdict: (view.verdict as string) ?? 'pending',
        awaitingOperator: instance.state === 'awaiting_operator',
      });
    }
    return snapshots;
  }

  /**
   * @purpose Actionable MRs from the last poll with no RoleInstance — unassigned set (F7).
   * @returns Array of unassigned actionable MRs.
   * @consumer BoardProviderReal
   */
  listUnassigned(): VcsActionableMr[] {
    const unassigned: VcsActionableMr[] = [];
    for (const mr of this._lastPolled.values()) {
      if (!this.findInstance(mr.webUrl)) {
        unassigned.push(mr);
      }
    }
    return unassigned;
  }

  /**
   * @purpose MR data from the last poll by webUrl — enriches instance cards with real metadata.
   * @param webUrl MR web URL.
   * @returns The polled MR or undefined.
   * @consumer BoardProviderReal
   */
  getPolledMr(webUrl: string): VcsActionableMr | undefined {
    return this._lastPolled.get(webUrl);
  }

  /**
   * @purpose Find an instance by MR URL and optional role filter.
   * @param mrUrl MR web URL.
   * @param [roleName] Optional role name to filter by.
   * @returns The matching instance or undefined.
   * @consumer BoardProviderReal
   */
  findInstance(mrUrl: string, roleName?: string): RoleInstance | undefined {
    for (const instance of this._instances.values()) {
      if (instance.mr === mrUrl && (!roleName || instance.role === roleName)) {
        return instance;
      }
    }
    return undefined;
  }

  /**
   * @purpose Get error count for an instance key — for diagnostics.
   * @param key Instance key.
   * @returns Consecutive error count or 0.
   */
  getInstanceErrorCount(key: string): number {
    return this._errorCount.get(key) ?? 0;
  }

  /**
   * @purpose Expose the configured VCS host for MR URL validation.
   * @returns VCS hostname from the underlying VcsInboxPort.
   */
  getVcsHost(): string {
    return this._config.vcs.getHost();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * @purpose Filter non-actionable MRs via CLI pipeline (classify + buildInboxView).
   * Drops approved-by-me, idle, and stale drafts. Deltas are in-memory only.
   * @param items Raw actionable MRs from the VCS poll.
   * @param registry Loaded inbox registry (read-only here — stage cache + delta basis).
   * @returns Filtered actionable MRs; raw list when the filter fails (degrade open).
   */
  protected async _filterActionable(
    items: VcsActionableMr[],
    registry: Parameters<typeof classifyInbox>[1]
  ): Promise<VcsActionableMr[]> {
    try {
      const nowIso = new Date().toISOString();
      const { deltas } = classifyInbox(items, registry, nowIso);

      const stages = new Map<string, MrStage>();
      for (const [url, entry] of Object.entries(registry.entries)) {
        const stage = (entry as { stage?: string } | undefined)?.stage;
        if (stage) stages.set(url, stage as MrStage);
      }

      const myLogin = await this._config.vcs.getMyLogin();
      const view = buildInboxView(
        items,
        { drafts: false, includeStale: false, staleDays: 14, ciAll: false, all: false },
        nowIso,
        deltas,
        stages,
        myLogin
      );

      const visible = new Set<string>();
      for (const group of view.groups) {
        for (const item of group.items) visible.add(item.webUrl);
      }
      return items.filter((mr) => visible.has(mr.webUrl));
    } catch (error) {
      // Degrade open: raw list is noisy but usable; an empty board is not.
      logger.warn('[RoleScheduler#_filterActionable] [filter → fallback_raw]', {
        error: String(error),
      });
      return items;
    }
  }

  /**
   * @purpose Gate `step()` at `node_prepare` (SV-19/20/21): a bare commit bumps a counter; a fresh
   *   reply arms a quiet window, and `step()` proceeds once it elapses.
   * @invariant Degrade-open: any failure lets `step()` through unchanged — best-effort, never a hard gate.
   * @param instance Active role instance being considered for this tick's `step()`.
   * @param registry Loaded registry — resolves project/iid for the `DebounceTracker` ref.
   * @returns True when `step()` should proceed this tick.
   */
  protected async _shouldAdvanceInstance(
    instance: RoleInstance,
    registry: InboxRegistry
  ): Promise<boolean> {
    const entry = registry.entries[instance.mr];
    if (!entry) return true;
    const ref = `${entry.project}!${entry.iid}`;
    const tracker = new DebounceTracker(this._config.store.getStateDir());

    try {
      const nodeContext = await buildNodeContext(instance.mr, {
        vcs: this._config.vcs,
        store: this._config.store,
        fetchDiffRefs: this._config.fetchDiffRefs ?? fetchDiffRefsLive,
      });
      const headChanged = nodeContext.artifacts['headChanged'] as string | undefined;
      const myLogin = await this._config.vcs.getMyLogin();
      const discussions = await this._config.vcs.getDiscussions(instance.mr, { my: true });

      const pendingSince = tracker.lastEventAt(ref);
      const since = pendingSince ?? instance.createdAt;
      const now = new Date().toISOString();
      const signal = detectMrEvents(discussions, headChanged, myLogin, since);

      // Live bug (2026-07-23, D-138): SV-20's "wait for a reply to MY thread" debounce assumes a
      // thread of mine already exists. `discussions` is `{my:true}`-filtered — empty means I've
      // never posted here, so `hasMyThreadReply` can never fire and a lone `hasNewCommit` would
      // block this MR's first pass forever (stalled `mail/messenger!164` over an hour, invisible
      // on the board). A review I haven't started yet isn't the "watch an active review" case.
      if (discussions.length === 0) return true;

      // #region START_APPLY_DEBOUNCE — a reply (re)arms the window (SV-20); commit-only never arms it (SV-19).
      if (signal.hasMyThreadReply) {
        tracker.recordEvent(ref, now);
        const elapsed = tracker.shouldTriggerAnalysis(ref, now);
        if (elapsed) tracker.clear(ref);
        return elapsed;
      }

      if (pendingSince !== undefined) {
        const elapsed = tracker.shouldTriggerAnalysis(ref, now);
        if (elapsed) tracker.clear(ref);
        return elapsed;
      }

      if (signal.hasNewCommit) {
        logger.debug('[RoleScheduler#_shouldAdvanceInstance] [observing → commit_only]', {
          mr: instance.mr,
        });
        return false;
      }

      return true;
      // #endregion END_APPLY_DEBOUNCE
    } catch (error) {
      logger.warn('[RoleScheduler#_shouldAdvanceInstance] [observing → degraded]', {
        mr: instance.mr,
        error: String(error),
      });
      return true;
    }
  }

  /**
   * @purpose Match mr.role to role.name for assignment. Works for any role.
   * @param mr Actionable MR.
   * @param role Registered role descriptor.
   * @returns True if the role should handle this MR.
   */
  protected _shouldAssignRole(mr: VcsActionableMr, role: RegisteredRole): boolean {
    return mr.role === role.name;
  }

  /**
   * @purpose Assign a role to an MR — disk-aware (SV-15..SV-18): `resume`/`recover` restores from
   *   the canonical `review.json` instead of re-running the battery; `fresh` keeps today's path.
   * @invariant `recover` runs `recoverLegacyArtifact` first (re-verify + materialize), then
   *   resumes exactly like `resume` — a legacy snapshot never skips re-verification (D-129).
   * @invariant Recovery/read degrading (no `review.json` ends up on disk) falls through to the
   *   from-zero path below — never blocks assignment.
   * @param mr Actionable MR being assigned.
   * @param role Registered role descriptor.
   * @param key Composite instance key (`${role}:${mrWebUrl}`).
   * @param isNew Whether this MR is new to the registry — forwarded to the from-zero path's log only.
   * @param reconciliation This MR's reconciliation decision, or undefined when reconciliation degraded.
   * @returns Promise that resolves once the instance is created, or immediately when the role has no definition.
   * @sideEffect Mutates `this._instances`. May write `review.json` (via `recoverLegacyArtifact`) and clone/fetch a worktree (via `buildNodeContext`/`recoverLegacyArtifact`).
   */
  protected async _assignRole(
    mr: VcsActionableMr,
    role: RegisteredRole,
    key: string,
    isNew: boolean,
    reconciliation: MrReconciliation | undefined
  ): Promise<void> {
    const definition = this._config.engine.retrieve(role.name);
    if (!definition) return;

    // #region START_RESUME_FROM_DISK — invariant: a canonical/legacy snapshot restores state
    // instead of re-initializing from zero (SV-15..SV-18); `recover` re-verifies+materializes first.
    if (reconciliation?.action === 'recover' && reconciliation.snapshot) {
      await recoverLegacyArtifact(reconciliation.snapshot.dir, mr, {
        vcs: this._config.vcs,
        store: this._config.store,
      });
    }

    if (
      (reconciliation?.action === 'resume' || reconciliation?.action === 'recover') &&
      reconciliation.snapshot
    ) {
      const review = readCanonicalReview(reconciliation.snapshot.dir);
      if (review) {
        const checkpoint = buildResumeCheckpoint(definition.graph, review);
        const instance = new RoleInstance({
          id: key,
          role: role.name,
          mr: mr.webUrl,
          graph: definition.graph,
          opencode: this._config.opencode,
          vcs: this._config.vcs,
          store: this._config.store,
          dryRun: this._config.dryRun ?? false,
          reviewSessionPool: this._config.reviewSessionPool,
          checkpoint,
        });
        this._instances.set(key, instance);
        logger.info('[RoleScheduler#_assignRole] [ticking → resumed]', {
          role: role.name,
          mr: mr.webUrl,
          action: reconciliation.action,
        });
        return;
      }
      // Recovery degraded (no review.json materialized) — fall through to the from-zero path.
    }
    // #endregion END_RESUME_FROM_DISK

    const checkpoint = await this._buildInitialCheckpoint(mr.webUrl, definition.graph);
    const instance = new RoleInstance({
      id: key,
      role: role.name,
      mr: mr.webUrl,
      graph: definition.graph,
      opencode: this._config.opencode,
      vcs: this._config.vcs,
      store: this._config.store,
      dryRun: this._config.dryRun ?? false,
      reviewSessionPool: this._config.reviewSessionPool,
      checkpoint,
    });
    this._instances.set(key, instance);
    await this._config.pipeline?.startReview(this._canonicalMrRef(mr), {
      role: role.name === 'author' ? 'author' : 'reviewer',
      changeset: (
        (checkpoint?.artifacts['changesetFiles'] as
          | Array<{ path: string; action: 'added' | 'modified' | 'deleted' }>
          | undefined) ?? []
      ).map(({ path, action }) => ({ path, action })),
    });
    logger.info('[RoleScheduler#_assignRole] [ticking → assigned]', {
      role: role.name,
      mr: mr.webUrl,
      isNew,
    });
  }

  /**
   * @purpose Seed initial artifacts from a live NodeContext when `buildLiveContext` is on;
   *   absent otherwise, so the legacy test-seed path stays unaffected.
   * @invariant Off by default — live building costs network + git I/O per assignment.
   * @param mrUrl MR web URL being assigned.
   * @param graph Role graph; its first node id anchors the checkpoint's resume point.
   * @returns Checkpoint seeding live artifacts, or undefined when disabled or build failed.
   */
  protected async _buildInitialCheckpoint(
    mrUrl: string,
    graph: RoleGraph
  ): Promise<RoleInstanceCheckpoint | undefined> {
    if (!this._config.buildLiveContext) return undefined;

    try {
      const nodeContext = await buildNodeContext(mrUrl, {
        vcs: this._config.vcs,
        store: this._config.store,
        fetchDiffRefs: this._config.fetchDiffRefs ?? fetchDiffRefsLive,
      });

      return {
        currentNode: graph.nodes[0]?.id ?? '',
        continueCount: 0,
        restartCount: 0,
        artifacts: nodeContext.artifacts,
      };
    } catch (error) {
      logger.warn('[RoleScheduler#_buildInitialCheckpoint] [building → degraded]', {
        mrUrl,
        error: String(error),
      });
      return undefined;
    }
  }

  /**
   * @purpose Check legacy + current report trees for an already-materialized review.
   *   Build a resume checkpoint when found so the instance skips the review battery.
   * @invariant Degrade-open: a missing VCS response, absent `review.json`, or a read failure all
   *   return `undefined` — the caller falls through to the from-zero path.
   * @param mrUrl MR web URL.
   * @param graph Role graph for checkpoint construction.
   * @returns Resume checkpoint, or `undefined` when disk is empty / unreadable / unreachable.
   * @sideEffect Network: `vcs.getMrContext` fetch (one lightweight metadata call). FS: reads
   *   `review.json` from whichever tree provides it first.
   */
  protected async _tryResumeFromDisk(
    mrUrl: string,
    graph: RoleGraph
  ): Promise<RoleInstanceCheckpoint | undefined> {
    try {
      const mrContext = await this._config.vcs.getMrContext(mrUrl);
      const ref = `${mrContext.project}!${mrContext.iid}`;
      const stateDir = this._config.store.getStateDir();

      const currentDir = mrReportsDir(stateDir, ref);
      let review = readCanonicalReview(currentDir);

      if (!review) {
        const legacyDir = legacyReportDir(stateDir, mrKey(ref));
        review = readCanonicalReview(legacyDir);
      }

      if (review) {
        logger.info('[RoleScheduler#_tryResumeFromDisk] [idle → resume]', {
          mr: mrUrl,
          verdict: review.verdict,
          revision: review.revision,
        });
        return buildResumeCheckpoint(graph, review);
      }

      return undefined;
    } catch (cause) {
      logger.debug('[RoleScheduler#_tryResumeFromDisk] [looking → degraded]', {
        mr: mrUrl,
        error: String(cause),
      });
      return undefined;
    }
  }
}
