// @file: Mock factory for board state — Kanban lanes grouped by role.
// @consumers: inbox-dashboard e2e, inbox-api tests
// @tasks: TSK-105

import type { ActionableMr } from './mr.mock.ts';

/**
 * @purpose A role on the serve dashboard with its Kanban lanes.
 * @invariant Each role has four lanes: inbox, inProgress, awaitingMe, done.
 */
export type BoardRole = {
  /** @purpose Role name (reviewer, author, mentioned) */
  name: string;
  /** @purpose Whether the role pipeline is active */
  active: boolean;
  /** @purpose Kanban lanes for this role */
  lanes: {
    /** @purpose MRs waiting to be picked up */
    inbox: ActionableMr[];
    /** @purpose MRs currently being processed */
    inProgress: ActionableMr[];
    /** @purpose MRs awaiting operator action */
    awaitingMe: ActionableMr[];
    /** @purpose Completed MRs */
    done: ActionableMr[];
  };
};

/**
 * @purpose Complete board state for the serve dashboard.
 * @invariant Roles are ordered; unassigned holds MRs without a role match.
 */
export type Board = {
  /** @purpose Grouped MRs by role */
  roles: BoardRole[];
  /** @purpose MRs that don't match any active role */
  unassigned: ActionableMr[];
};

/**
 * @purpose Create a mock Board state with overridable fields.
 * @param [overrides] Partial board state to merge over defaults.
 * @returns Fully populated Board.
 */
export function mockBoard(overrides?: Partial<Board>): Board {
  const defaults: Board = {
    roles: [
      {
        name: 'reviewer',
        active: true,
        lanes: {
          inbox: [],
          inProgress: [],
          awaitingMe: [],
          done: [],
        },
      },
    ],
    unassigned: [],
  };

  if (!overrides) return structuredClone(defaults);
  return { ...defaults, ...overrides };
}
