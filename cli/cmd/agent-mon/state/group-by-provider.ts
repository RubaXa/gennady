// @file: Group sessions by provider and sort within each column.
// @consumers: state/create-state-manager
// @tasks: TSK-45

import type { AgentSession } from '../../../../services/agent-mon/model/agent-session.type.ts';
import type { ProviderColumn, SessionCard } from './view-model.type.ts';
import { isWaitingForUser } from './is-waiting.ts';

/**
 * @purpose Sort priority for session card statuses — used to order sessions within a provider column.
 * @invariant Lower number = higher priority; 'waiting' is derived, not native.
 */
const STATUS_PRIORITY: Record<SessionCard['status'], number> = {
  active: 0,
  waiting: 1,
  idle: 2,
  completed: 3,
};

/**
 * @purpose Format elapsed seconds into a compact human-readable string.
 * @invariant Output format: "<ns" | "Nm" | "Nh".
 */
function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/**
 * @purpose Transform an AgentSession into a SessionCard, applying waiting heuristic.
 * @param session Raw agent session from the agent-mon library.
 * @param isWaitingFn Waiting detection function — injected for testability.
 * @returns Mapped session card with derived fields.
 */
function toSessionCard(
  session: AgentSession,
  isWaitingFn: (s: AgentSession) => boolean,
): SessionCard {
  const isWaiting = isWaitingFn(session);
  return {
    sessionId: session.sessionId,
    title: session.title,
    model: session.model,
    status: isWaiting ? 'waiting' : (session.status as SessionCard['status']),
    elapsed: formatElapsedSeconds(session.elapsedSeconds),
    lastMessage: session.lastMessage,
    tokensIn: session.tokensInput,
    tokensOut: session.tokensOutput,
    cpuPercent: session.cpuPercent,
    memoryMb: session.memoryMb,
    isWaitingForOperator: isWaiting,
  };
}

/**
 * @purpose Group sessions by provider, compute per-column counts, and sort sessions within each column.
 * @invariant Sessions within each column are sorted: active → waiting → idle → completed.
 * @param sessions Flat array of agent sessions across all providers.
 * @param opts Optional overrides — isWaitingFn replaces default isWaitingForUser for testing.
 * @returns One ProviderColumn per unique provider, with sessions sorted by status priority.
 * @sideEffect None — pure transformation.
 */
export function groupByProvider(
  sessions: AgentSession[],
  opts?: { isWaitingFn?: (s: AgentSession) => boolean; limit?: number },
): ProviderColumn[] {
  const isWaitingFn = opts?.isWaitingFn ?? isWaitingForUser;

  // #region START_GROUP_BY_PROVIDER_KEY — invariant: provider key is non-empty per AgentSession contract
  const byProvider = new Map<string, AgentSession[]>();
  for (const session of sessions) {
    const group = byProvider.get(session.provider);
    if (group) {
      group.push(session);
    } else {
      byProvider.set(session.provider, [session]);
    }
  }
  // #endregion END_GROUP_BY_PROVIDER_KEY

  // #region START_BUILD_COLUMNS — invariant: sorting by status priority, then by title for stability within same status
  const columns: ProviderColumn[] = [];
  for (const [provider, providerSessions] of byProvider) {
    const cards = providerSessions
      .map((s) => toSessionCard(s, isWaitingFn))
      .sort((a, b) => {
        const prioDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (prioDiff !== 0) return prioDiff;
        return a.title.localeCompare(b.title);
      });

    const sliced = opts?.limit ? cards.slice(0, opts.limit) : cards;

    columns.push({
      provider,
      activeCount: sliced.filter((c) => c.status === 'active').length,
      waitingCount: sliced.filter((c) => c.status === 'waiting').length,
      idleCount: sliced.filter((c) => c.status === 'idle').length,
      sessions: sliced,
    });
  }
  // #endregion END_BUILD_COLUMNS

  return columns;
}
