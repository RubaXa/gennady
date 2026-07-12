// @file: RoleScheduler — orchestrates tick (poll → delta → assign → step → escalate) and manual assignment.
// @consumers: serve timer, inbox-api
// @tasks: TSK-113

import { logger } from '#logger';
import type { RoleEngine, RegisteredRole } from './role-engine.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort } from '../inbox-opencode/opencode.port.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { isValidMrUrl } from '../inbox-core/vcs-validators.ts';
import { RoleInstance } from './role-instance.ts';
import { RightsEscalator } from './rights-escalator.ts';
// AI-02 noise filter — reused from the CLI pipeline per SV-12 (functions, not spawn).
// Debt: move classify/build-view into inbox-core alongside the TSK-109 migration.
import { classifyInbox } from '../../../../cli/cmd/inbox/_core/logic/classify-inbox.logic.ts';
import { buildInboxView } from '../../../../cli/cmd/inbox/_core/logic/build-inbox-view.logic.ts';
import type { MrStage } from '../../../../cli/cmd/inbox/_core/logic/classify-mr-stage.logic.ts';

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

      // #region START_ASSIGN_NEW_MRS
      for (const mr of mrs) {
        const existing = registry.entries[mr.webUrl];
        const isNew = !existing;

        for (const role of activeRoles) {
          const key = this._instanceKey(role.name, mr.webUrl);
          const existingInstance = this._instances.get(key);

          if (!existingInstance && this._shouldAssignRole(mr, role)) {
            const definition = this._config.engine.retrieve(role.name);
            if (definition) {
              const instance = new RoleInstance({
                id: key,
                role: role.name,
                mr: mr.webUrl,
                graph: definition.graph,
                opencode: this._config.opencode,
                vcs: this._config.vcs,
                store: this._config.store,
              });
              this._instances.set(key, instance);
              logger.info('[RoleScheduler#tick] [ticking → assigned]', {
                role: role.name,
                mr: mr.webUrl,
                isNew,
              });
            }
          }
        }
      }
      // #endregion END_ASSIGN_NEW_MRS

      // #region START_ADVANCE_INSTANCES
      for (const [key, instance] of this._instances) {
        const pausedUntil = this._pausedUntil.get(key);
        if (pausedUntil !== undefined && Date.now() < pausedUntil) {
          continue;
        }

        if (
          instance.state === 'idle' ||
          instance.state === 'running' ||
          instance.state === 'awaiting_operator'
        ) {
          await instance.step();

          // F2: Track errors — state may have changed to 'error' or 'done' after step()
          const currentState: string = instance.state;
          if (currentState === 'error' || currentState === 'awaiting_operator') {
            const count = (this._errorCount.get(key) ?? 0) + 1;
            this._errorCount.set(key, count);

            if (count >= RoleScheduler.MAX_ERRORS) {
              logger.warn(
                '[RoleScheduler#tick] [ticking → paused] Instance paused after N errors',
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
          logger.warn('[RoleScheduler#tick] [ticking → escalation_failed]', {
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
          logger.debug('[RoleScheduler#tick] [ticking → cleaned]', { key, state: instance.state });
        }
      }
      // #endregion END_CLEANUP_DONE
    } finally {
      this._ticking = false;
      this._stopped = false;
      logger.debug('[RoleScheduler#tick] [ticking → idle]');
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

    const instance = new RoleInstance({
      id: key,
      role: roleName,
      mr: mrUrl,
      graph: definition.graph,
      opencode: this._config.opencode,
      vcs: this._config.vcs,
      store: this._config.store,
      rights,
    });

    this._instances.set(key, instance);
    logger.info('[RoleScheduler#assignManual] [assigning → assigned]', { key });
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
   * @purpose Match mr.role to role.name for assignment. Works for any role.
   * @param mr Actionable MR.
   * @param role Registered role descriptor.
   * @returns True if the role should handle this MR.
   */
  protected _shouldAssignRole(mr: VcsActionableMr, role: RegisteredRole): boolean {
    return mr.role === role.name;
  }
}
