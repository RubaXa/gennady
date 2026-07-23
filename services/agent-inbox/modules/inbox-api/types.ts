// @file: Shared types for inbox-api module — BoardData, RoleView, MrCard, MrDetail, AssignBody, ActionBody.
// @consumers: inbox-api routers, http-server, board-provider port, inbox-dashboard
// @tasks: TSK-106, TSK-145

import type { ActionableMr } from '../inbox-mocks/mr.mock.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import type { FindingSignature, FindingSignatureDiff } from '../inbox-core/finding-signature.ts';

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
  findings: Array<{ id?: string; severity: string; file: string; line: number; message: string }>;
  /** @purpose Final verdict (request_changes, approved, commented) */
  verdict: string;
  /** @purpose Audit trail for this MR */
  audit: AuditEntry[];
  /** @purpose `review.json#revision` at read time — CAS-ready input for a reconnecting `MutationApplier` client | @invariant `0` when no persisted `review.json` exists yet (D-99) */
  revision: number;
};

/** @purpose Request body for POST /api/mr/:id/assign. */
export type AssignBody = {
  /** @purpose Target role name */
  role: string;
  /** @purpose Optional access rights for the assigned role */
  rights?: Record<string, unknown>;
};

/** @purpose Operator's answer to an OperatorQuestion | @invariant Closed set — EffectExecutor dispatches by this value */
export type ActionChoice = 'post' | 'approve' | 'redispatch' | 'skip';

/** @purpose Request body for POST /api/mr/:id/action — generic answer to OperatorQuestion. */
export type ActionBody = {
  /** @purpose ID of the question being answered */
  questionId: string;
  /** @purpose Operator's choice/answer */
  choice: ActionChoice;
  /** @purpose Optional payload for the answer — selected candidates + edited text (post) or redispatch focus */
  payload?: unknown;
};

/** @purpose Standard JSON response envelope — all API responses use this shape. */
export type ApiResponse<T = unknown> = {
  /** @purpose Always true on success */
  ok: true;
} & T;

/** @purpose Render hint for an artifact's content — drives which viewer the dashboard picks. */
export type ArtifactKind = 'md' | 'mermaid' | 'json' | 'text';

/** @purpose One artifact entry in the `reports/<mr>/` tree — REPORT/PLAN/track/HISTORY/coverage. */
export type ArtifactRef = {
  /** @purpose Display name (e.g. REPORT.md) */
  name: string;
  /** @purpose Path relative to `reports/<mr>/`, passed back verbatim as the `path` query param */
  path: string;
  /** @purpose Render hint derived from the file extension */
  kind: ArtifactKind;
};

/** @purpose Content of one artifact returned by `GET /api/mr/:id/artifact?path=`. */
export type ArtifactContent = {
  /** @purpose Raw file content */
  content: string;
  /** @purpose Render hint, same enum as ArtifactRef.kind */
  kind: ArtifactKind;
};

/** @purpose Result of recording one "Copy fix task" click, returned by `POST /api/mr/:id/copy-fix-task` (SV-14, TSK-145). */
export type FixTaskCopyResult = {
  /** @purpose True when this MR has no prior `copied_fix_task` audit event */
  isFirst: boolean;
  /** @purpose Count of `copied_fix_task` events recorded before this call */
  priorCopyCount: number;
  /** @purpose Timestamp of the previous `copied_fix_task` event | @invariant null when isFirst */
  lastCopiedAt: string | null;
  /** @purpose Findings delta against the LAST prior snapshot | @invariant null when isFirst */
  delta: FindingSignatureDiff | null;
};

/** @purpose Detail payload stored in a `copied_fix_task` audit event — the finding signatures at click time. */
export type FixTaskCopySnapshot = {
  /** @purpose Signatures of every finding present at this click */
  signatures: FindingSignature[];
};
