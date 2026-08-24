// @file: Queue-aware readiness signal shared by sdd-state and the task execution map.
// @consumers: sdd-state.cmd, sdd-task.cmd
// @tasks: N/A

import type { TicketRef } from './check.ts';
import type { Scope } from './portal.ts';
import type { ReadinessResult } from './readiness.ts';

/**
 * @purpose Find TODO tickets in infrastructure scopes that are expected to build missing project gates.
 * @invariant A ready project, a portal without infrastructure scopes, or a queue without matching TODO tickets returns an empty list.
 * @param refs Every discovered task ticket.
 * @param scopes Portal scopes from the same project snapshot.
 * @param readiness Readiness verdict from the same project snapshot.
 * @returns Matching Task-IDs in discovery order.
 */
export function queuedInfraGateTicketIds(
  refs: TicketRef[],
  scopes: Scope[],
  readiness: ReadinessResult
): string[] {
  if (readiness.ready) return [];

  const infraScopeNames = new Set(
    scopes.filter((scope) => scope.type === 'infrastructure').map((scope) => scope.name)
  );
  if (infraScopeNames.size === 0) return [];

  return refs
    .filter(
      (ref) =>
        ref.taskId &&
        /\bTODO\b/i.test(ref.status ?? '') &&
        ref.scope &&
        infraScopeNames.has(ref.scope)
    )
    .map((ref) => ref.taskId as string);
}
