// @file: RoleScheduler — orchestrates tick (poll → delta → assign → step → escalate) and manual assignment.
// @consumers: serve timer, inbox-api
// @tasks: TSK-113

import { logger } from '#logger';
import type { RoleEngine, RegisteredRole } from './role-engine.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { OpenCodePort } from '../inbox-opencode/opencode.port.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { RoleInstance } from './role-instance.ts';

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

  /**
   * @purpose Create a scheduler bound to an engine, store, VCS, and OpenCode adapter.
   * @param config Required configuration: engine, store, vcs, opencode.
   */
  constructor(config: RoleSchedulerConfig) {
    this._config = config;
    this._instances = new Map();
    this._ticking = false;
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
    if (this._ticking) {
      logger.debug('[RoleScheduler#tick] [idle → skipped] Tick already in progress');
      return;
    }

    this._ticking = true;
    logger.debug('[RoleScheduler#tick] [idle → ticking]');

    try {
      // #region START_POLL_VCS
      const activeRoles = this._config.engine.list().filter((r) => r.active);
      if (activeRoles.length === 0) {
        logger.debug('[RoleScheduler#tick] [ticking → no_active_roles] No active roles to process');
        return;
      }

      const mrs = await this._config.vcs.getActionable();
      logger.debug('[RoleScheduler#tick] [ticking → polled]', { mrCount: mrs.length });
      // #endregion END_POLL_VCS

      // #region START_ASSIGN_NEW_MRS
      const registry = this._config.store.loadRegistry();
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
      for (const instance of this._instances.values()) {
        if (
          instance.state === 'idle' ||
          instance.state === 'running' ||
          instance.state === 'awaiting_operator'
        ) {
          await instance.step();
        }
      }
      // #endregion END_ADVANCE_INSTANCES

      // #region START_CLEANUP_DONE
      for (const [key, instance] of this._instances) {
        if (instance.state === 'done' || instance.state === 'error') {
          this._instances.delete(key);
          logger.debug('[RoleScheduler#tick] [ticking → cleaned]', { key, state: instance.state });
        }
      }
      // #endregion END_CLEANUP_DONE
    } finally {
      this._ticking = false;
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
    logger.info('[RoleScheduler#assignManual] [idle → assigning]', { role: roleName, mr: mrUrl });

    const definition = this._config.engine.retrieve(roleName);
    if (!definition) {
      logger.warn('[RoleScheduler#assignManual] [assigning → role_not_found]', { role: roleName });
      return;
    }

    if (!this._config.engine.isActive(roleName)) {
      logger.warn('[RoleScheduler#assignManual] [assigning → role_inactive]', { role: roleName });
      return;
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

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * @purpose Determine whether a given role should process an MR.
   * Matches role name to MR's myRole field from VcsActionableMr.
   * @param mr Actionable MR.
   * @param role Registered role descriptor.
   * @returns True if the role should handle this MR.
   */
  protected _shouldAssignRole(mr: VcsActionableMr, role: RegisteredRole): boolean {
    // Map role names to VcsActionableRole values
    const roleToActionableRole: Record<string, string> = {
      reviewer: 'reviewer',
      author: 'author',
    };
    const expected = roleToActionableRole[role.name];
    if (!expected) return false;

    // Assign if MR's myRole matches the role
    return mr.role === expected;
  }
}
