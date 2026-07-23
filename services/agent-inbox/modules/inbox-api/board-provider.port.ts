// @file: BoardProviderPort — abstract boundary for board state access: getBoard, assignMr, executeAction, getReport.
// @consumers: inbox-api routers, inbox-dashboard, DI container
// @tasks: TSK-106, TSK-145

import type {
  BoardData,
  MrDetail,
  ArtifactRef,
  ArtifactContent,
  FixTaskCopyResult,
} from './types.ts';

/**
 * @purpose Abstraction of board state for the inbox-api layer.
 * @invariant All methods return typed data — routers are indifferent to mock vs real.
 * @invariant assignMr returns { ok: false } when MR is not found.
 * @invariant getReport returns null when MR is not found.
 * @consumer BoardRouter, MrRouter
 */
export abstract class BoardProviderPort {
  /**
   * @purpose Retrieve the full board state — all roles with their lanes and unassigned MRs.
   * @returns BoardData with roles[] and unassigned[].
   */
  abstract getBoard(): BoardData;

  /**
   * @purpose Assign an MR to a role, moving it from unassigned to the role's inbox lane.
   * @param mrId MR identifier (webUrl).
   * @param role Target role name (reviewer, author, mentioned).
   * @param rights Optional access rights.
   * @returns { ok: true } on success, { ok: false } if MR not found.
   */
  abstract assignMr(mrId: string, role: string, rights?: Record<string, unknown>): { ok: boolean };

  /**
   * @purpose Execute an operator action on an MR (answer an OperatorQuestion).
   * @param mrId MR identifier (webUrl).
   * @param action Action payload with questionId, choice, and optional payload.
   * @returns { ok: true } on success, { ok: false } if MR not found.
   */
  abstract executeAction(
    mrId: string,
    action: { questionId: string; choice: string; payload?: unknown }
  ): { ok: boolean };

  /**
   * @purpose Retrieve the detailed report for an MR — findings, verdict, audit trail.
   * @param mrId MR identifier (webUrl).
   * @returns MrDetail on success, null if MR not found.
   */
  abstract getReport(mrId: string): MrDetail | null;

  /**
   * @purpose Record one "Copy fix task" click — appends a `copied_fix_task` audit snapshot, returns the delta against the LAST one (SV-14, SV-10, D-126, TSK-145).
   * @invariant Independent of the live-instance requirement `executeAction` enforces — works for any
   *   MR with a materialized report, including via `getReport`'s disk-fallback path after a restart.
   * @invariant Every call appends exactly one new `copied_fix_task` audit event.
   * @param mrId MR identifier (webUrl or `project!iid`).
   * @returns FixTaskCopyResult on success, null if `getReport(mrId)` finds no report for this MR.
   * @sideEffect Appends one audit event.
   */
  abstract recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult | null>;

  /**
   * @purpose List all review artifacts (REPORT/PLAN/track/HISTORY/coverage) under `reports/<mr>/`.
   * @invariant Default returns empty — subclasses without a real `reports/<mr>/` backing (e.g. BoardProviderReal pre-TSK-113) are not forced to implement this yet.
   * @param mrId MR identifier (webUrl).
   * @returns ArtifactRef[] for the artifact browser navigation; empty array if MR not found or unsupported.
   */
  listArtifacts(mrId: string): ArtifactRef[] {
    void mrId;
    return [];
  }

  /**
   * @purpose Retrieve the content of one artifact for the artifact browser render.
   * @invariant Default returns null — same rationale as {@link listArtifacts}.
   * @param mrId MR identifier (webUrl).
   * @param path Artifact path relative to `reports/<mr>/` — caller (router) has already rejected traversal attempts.
   * @returns ArtifactContent on success, null if MR, artifact path not found, or unsupported.
   */
  readArtifact(mrId: string, path: string): ArtifactContent | null {
    void mrId;
    void path;
    return null;
  }
}
