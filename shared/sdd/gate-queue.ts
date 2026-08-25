// @file: Queue-aware readiness signal shared by sdd-state and the task execution map.
// @consumers: sdd-state.cmd, sdd-task.cmd
// @tasks: N/A

import type { TicketRef } from './check.ts';
import type { Scope } from './portal.ts';
import type { ReadinessResult } from './readiness.ts';

/**
 * @purpose Case/separator-insensitive normalization for comparing a ticket's scope name against the portal.
 * @param name Raw scope name.
 * @returns Lowercased name with dashes and underscores stripped.
 */
function normalizeScopeName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '');
}

/** @purpose One advisory signal about the infra gate queue itself, surfaced alongside the ticket list. */
export type GateQueueDiagnostic = {
  /** @purpose Stable diagnostic kind for callers that want to branch on it. */
  kind: 'infra-spec-no-tickets' | 'scope-name-mismatch';
  /** @purpose Human-readable line, ready to print as-is. */
  message: string;
};

/** @purpose Queued-infra-gate lookup result: the ticket list plus advisory diagnostics about the queue. */
export type GateQueueResult = {
  /** @purpose Matching Task-IDs in discovery order — same contract as before this diagnostic addition. */
  ticketIds: string[];
  /** @purpose Advisory findings: approved infra scopes with no carved tickets, near-miss scope names. */
  diagnostics: GateQueueDiagnostic[];
};

/**
 * @purpose Find TODO tickets in infra scopes expected to build missing gates, plus advisory queue diagnostics.
 * @invariant An execution-ready project, a portal without infrastructure scopes, or a queue without matching TODO tickets returns an empty ticket list.
 * @invariant Diagnostics never change `ticketIds`, and are computed only while not execution-ready
 *   — a provisional project still surfaces the queue replacing its stubs.
 * @param refs Every discovered task ticket.
 * @param scopes Portal scopes from the same project snapshot.
 * @param readiness Readiness verdict from the same project snapshot.
 * @returns Matching Task-IDs, plus diagnostics for approved-but-unscaffolded infra scopes and near-miss scope names.
 */
export function queuedInfraGateTicketIds(
  refs: TicketRef[],
  scopes: Scope[],
  readiness: ReadinessResult
): GateQueueResult {
  if (readiness.executionReady) return { ticketIds: [], diagnostics: [] };

  const infraScopes = scopes.filter((scope) => scope.type === 'infrastructure');
  const infraScopeNames = new Set(infraScopes.map((scope) => scope.name));

  const ticketIds =
    infraScopeNames.size === 0
      ? []
      : refs
          .filter(
            (ref) =>
              ref.taskId &&
              /\bTODO\b/i.test(ref.status ?? '') &&
              ref.scope &&
              infraScopeNames.has(ref.scope)
          )
          .map((ref) => ref.taskId as string);

  const diagnostics: GateQueueDiagnostic[] = [];

  // #region START_NOT_SCAFFOLDED — invariant: approved infra scope with zero referencing tickets (exact or near-miss name), of any status
  const normalizedScopeOf = (scope: Scope): string => normalizeScopeName(scope.name);
  for (const scope of infraScopes) {
    if (scope.status !== 'done') continue;
    const hasAnyTicket = refs.some(
      (ref) => !!ref.scope && normalizeScopeName(ref.scope) === normalizedScopeOf(scope)
    );
    if (!hasAnyTicket) {
      diagnostics.push({
        kind: 'infra-spec-no-tickets',
        message: `infra-спека \`${scope.name}\` одобрена, тикетов пока нет — нарежь scaffold'ом`,
      });
    }
  }
  // #endregion END_NOT_SCAFFOLDED

  // #region START_NAME_MISMATCH — invariant: TODO ticket whose scope near-misses a portal infra name, case/separator-insensitive only
  const normalizedInfra = new Map(infraScopes.map((s) => [normalizeScopeName(s.name), s.name]));
  for (const ref of refs) {
    if (!ref.taskId || !ref.scope || !/\bTODO\b/i.test(ref.status ?? '')) continue;
    if (infraScopeNames.has(ref.scope)) continue;
    const match = normalizedInfra.get(normalizeScopeName(ref.scope));
    if (match) {
      diagnostics.push({
        kind: 'scope-name-mismatch',
        message: `область тикета '${ref.scope}' не совпала с порталом '${match}' (похожие имена)`,
      });
    }
  }
  // #endregion END_NAME_MISMATCH

  return { ticketIds, diagnostics };
}
