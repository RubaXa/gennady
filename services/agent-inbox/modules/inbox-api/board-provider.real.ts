// @file: BoardProviderReal — real-mode BoardProviderPort impl backed by RoleScheduler instance states.
// @consumers: inbox-api routers, inbox-dashboard, DI container
// @tasks: TSK-117

import { BoardProviderPort } from './board-provider.port.ts';
import type { BoardData, RoleView, MrCard, MrDetail } from './types.ts';
import type { RoleScheduler, RoleInstanceSnapshot } from '../inbox-roles/role-scheduler.ts';
import type { RoleEngine, RegisteredRole } from '../inbox-roles/role-engine.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/**
 * @purpose Build a MrCard from a polled VcsActionableMr — real metadata for the dashboard (F7).
 * @param mr Actionable MR from the last VCS poll.
 * @param [role] Role name when the MR is under an instance.
 * @returns MrCard with real project/iid/title fields.
 */
function actionableToMrCard(mr: VcsActionableMr, role?: string): MrCard {
  return {
    project: mr.project,
    iid: Number(mr.iid) || 0,
    webUrl: mr.webUrl,
    title: mr.title,
    description: mr.description,
    author: mr.author,
    reviewers: mr.reviewers,
    approvedBy: mr.approvedBy,
    updatedAt: mr.updatedAt,
    draft: mr.draft,
    state: mr.state,
    role: (role ?? mr.role) as MrCard['role'],
    events: [],
    directlyAddressed: false,
    todoIds: [],
    stage: 'review_needed',
    sourceBranch: '',
    targetBranch: '',
  } as MrCard;
}

/**
 * @purpose Build a MrCard from a RoleInstanceSnapshot for dashboard display.
 * Skeleton fallback when the MR is not present in the last poll.
 * @param snap Instance snapshot from scheduler.
 * @returns MrCard populated from snapshot data.
 */
function snapshotToMrCard(snap: RoleInstanceSnapshot): MrCard {
  return {
    iid: '',
    project: '',
    webUrl: snap.mr,
    title: snap.mr,
    description: '',
    author: '',
    reviewers: [],
    approvedBy: [],
    updatedAt: '',
    draft: false,
    state: 'opened',
    role: snap.role,
    events: [],
    directlyAddressed: false,
    todoIds: [],
  } as unknown as MrCard;
}

/**
 * @purpose Map an InstanceState to a board lane.
 * @param state RoleInstance state.
 * @returns Lane name: inbox, inProgress, awaitingMe, or done.
 */
function stateToLane(state: string): 'inbox' | 'inProgress' | 'awaitingMe' | 'done' {
  switch (state) {
    case 'idle':
      return 'inbox';
    case 'running':
      return 'inProgress';
    case 'awaiting_operator':
      return 'awaitingMe';
    case 'done':
      return 'done';
    default:
      return 'inbox';
  }
}

/**
 * @purpose Real board provider — wraps RoleScheduler to implement BoardProviderPort.
 * getBoard() builds BoardData from RoleInstance states.
 * assignMr / executeAction delegate to the scheduler.
 * @invariant All data comes from the live scheduler — no mock seeding.
 * @consumer DI container (bootstrap.ts) for mocks=false
 */
export class BoardProviderReal extends BoardProviderPort {
  /** @purpose Role scheduler providing live instance data. */
  protected _scheduler: RoleScheduler;
  /** @purpose Role engine providing role definitions and activation state. */
  protected _engine: RoleEngine;

  /**
   * @purpose Create a BoardProviderReal backed by the given scheduler and engine.
   * @param scheduler The live RoleScheduler.
   * @param engine The RoleEngine for role metadata.
   */
  constructor(scheduler: RoleScheduler, engine: RoleEngine) {
    super();
    this._scheduler = scheduler;
    this._engine = engine;
  }

  /**
   * @returns Board data built from live RoleScheduler instance states.
   * @see {BoardProviderPort#getBoard}
   */
  getBoard(): BoardData {
    const instances = this._scheduler.listInstances();
    const allRoles = this._engine.list();

    // Build empty lanes for all registered roles
    const lanesByRole: Map<
      string,
      { inbox: MrCard[]; inProgress: MrCard[]; awaitingMe: MrCard[]; done: MrCard[] }
    > = new Map();
    for (const role of allRoles) {
      lanesByRole.set(role.name, { inbox: [], inProgress: [], awaitingMe: [], done: [] });
    }

    const assignedMrs = new Set<string>();

    // Place each instance into its role's lane based on state.
    // Card metadata comes from the last poll when available (F7).
    for (const snap of instances) {
      const roleLanes = lanesByRole.get(snap.role);
      if (!roleLanes) continue;

      const polled = this._scheduler.getPolledMr(snap.mr);
      const card = polled ? actionableToMrCard(polled, snap.role) : snapshotToMrCard(snap);
      const lane = stateToLane(snap.state);
      roleLanes[lane].push(card);
      assignedMrs.add(snap.mr);
    }

    // Build RoleView array
    const roles: RoleView[] = allRoles.map((r: RegisteredRole) => ({
      name: r.name,
      active: r.active,
      lanes: lanesByRole.get(r.name) ?? { inbox: [], inProgress: [], awaitingMe: [], done: [] },
    }));

    // F7: MRs from the last poll without a RoleInstance — the «БЕЗ РОЛИ» set (SV-06).
    const unassigned: MrCard[] = this._scheduler
      .listUnassigned()
      .map((mr) => actionableToMrCard(mr));

    return { roles, unassigned };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @param role Target role name.
   * @param [rights] Optional access rights map.
   * @returns Operation result — delegates to scheduler.assignManual.
   * @see {BoardProviderPort#assignMr}
   */
  assignMr(mrId: string, role: string, rights?: Record<string, unknown>): { ok: boolean } {
    // Fire-and-forget: assignManual is async but we don't await here
    // because the port is synchronous. The scheduler handles it eventually.
    void this._scheduler.assignManual(mrId, role, rights);
    return { ok: true };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @param _action Action payload with questionId, choice, and optional payload.
   * @returns Operation result — finds instance and advances it past ask node.
   * @see {BoardProviderPort#executeAction}
   */
  executeAction(
    mrId: string,
    _action: { questionId: string; choice: string; payload?: unknown }
  ): { ok: boolean } {
    const instance = this._scheduler.findInstance(mrId);
    if (!instance || instance.state !== 'awaiting_operator') {
      return { ok: false };
    }

    // D3: Store the operator's answer so the ask node can use it, then advance
    instance.setAnswer(_action.choice);
    void instance.step();
    return { ok: true };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @returns MR detail with findings and verdict, or null if instance not found.
   * @see {BoardProviderPort#getReport}
   */
  getReport(mrId: string): MrDetail | null {
    const instances = this._scheduler.listInstances();
    const snap = instances.find((i) => i.mr === mrId);
    if (!snap) return null;

    const polled = this._scheduler.getPolledMr(snap.mr);
    return {
      mr: polled ? actionableToMrCard(polled, snap.role) : snapshotToMrCard(snap),
      findings: snap.findings,
      verdict: snap.verdict,
      audit: [],
    };
  }
}
