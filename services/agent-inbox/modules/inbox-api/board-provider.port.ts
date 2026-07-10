// @file: BoardProviderPort — abstract boundary for board state access: getBoard, assignMr, executeAction, getReport.
// @consumers: inbox-api routers, inbox-dashboard, DI container
// @tasks: TSK-106

import type { BoardData, MrDetail } from './types.ts';

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
}
