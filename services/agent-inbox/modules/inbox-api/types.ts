// @file: Shared types for inbox-api module — BoardData, RoleView, MrCard, MrDetail, AssignBody, ActionBody.
// @consumers: inbox-api routers, http-server, board-provider port, inbox-dashboard
// @tasks: TSK-106

import type { ActionableMr } from '../inbox-mocks/mr.mock.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';

/** @purpose A role on the serve dashboard with its Kanban lanes — exposed by GET /api/board. */
export type RoleView = {
  /** @purpose Role name (reviewer, author, mentioned) */
  name: string;
  /** @purpose Whether the role pipeline is active */
  active: boolean;
  /** @purpose Kanban lanes for this role */
  lanes: {
    /** @purpose MRs waiting to be picked up */
    inbox: MrCard[];
    /** @purpose MRs currently being processed */
    inProgress: MrCard[];
    /** @purpose MRs awaiting operator action */
    awaitingMe: MrCard[];
    /** @purpose Completed MRs */
    done: MrCard[];
  };
};

/** @purpose An MR card as displayed in board lanes — thin alias over ActionableMr. */
export type MrCard = ActionableMr;

/** @purpose Complete board state returned by GET /api/board. */
export type BoardData = {
  /** @purpose Grouped MRs by role */
  roles: RoleView[];
  /** @purpose MRs that don't match any active role */
  unassigned: MrCard[];
};

/** @purpose Detailed MR report returned by GET /api/mr/:id/report. */
export type MrDetail = {
  /** @purpose The MR card info */
  mr: MrCard;
  /** @purpose AI findings from the review pass */
  findings: Array<{ severity: string; file: string; line: number; message: string }>;
  /** @purpose Final verdict (request_changes, approved, commented) */
  verdict: string;
  /** @purpose Audit trail for this MR */
  audit: AuditEntry[];
};

/** @purpose Request body for POST /api/mr/:id/assign. */
export type AssignBody = {
  /** @purpose Target role name */
  role: string;
  /** @purpose Optional access rights for the assigned role */
  rights?: Record<string, unknown>;
};

/** @purpose Request body for POST /api/mr/:id/action — generic answer to OperatorQuestion. */
export type ActionBody = {
  /** @purpose ID of the question being answered */
  questionId: string;
  /** @purpose Operator's choice/answer */
  choice: string;
  /** @purpose Optional payload for the answer */
  payload?: unknown;
};

/** @purpose Standard JSON response envelope — all API responses use this shape. */
export type ApiResponse<T = unknown> = {
  /** @purpose Always true on success */
  ok: true;
} & T;
