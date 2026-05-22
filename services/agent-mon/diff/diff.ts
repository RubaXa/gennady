// @file: Pure diff function comparing two AgentSession snapshots by semantic fields (excludes noisy cpuPercent, memoryMb)
// @consumers: observe, cli
// @tasks: TSK-37

import { logger } from '#logger';
import type { AgentSession } from '../model/agent-session.type.js';
import type { SessionChanges } from '../model/session-changes.type.js';

/**
 * Semantic fields compared by diff — excludes cpuPercent and memoryMb (noisy per-scan fluctuations that do not constitute a meaningful change).
 * @invariant Must stay aligned with the diff contract: changes to this list change what triggers `updated`.
 */
const SEMANTIC_FIELDS: ReadonlyArray<keyof AgentSession> = [
  'status',
  'title',
  'lastActivityAt',
  'elapsedSeconds',
  'idleSeconds',
  'toolCallCount',
  'errorCount',
  'lastMessage',
  'tokensInput',
  'tokensOutput',
];

/**
 * @purpose Compare two AgentSession snapshots and produce added, removed, updated change categories.
 * @param prev Previous snapshot of sessions — may be empty.
 * @param curr Current snapshot of sessions — may be empty.
 * @returns SessionChanges with sessions partitioned by change type (all arrays may be empty).
 */
export function diff(prev: AgentSession[], curr: AgentSession[]): SessionChanges {
  logger.debug('[diff] [idle → comparing]');

  const prevMap = new Map(prev.map(s => [s.sessionId, s]));
  const currMap = new Map(curr.map(s => [s.sessionId, s]));

  const added: AgentSession[] = [];
  const removed: AgentSession[] = [];
  const updated: AgentSession[] = [];

  // #region START_FIND_ADDED_AND_UPDATED
  // purpose: scan current snapshot to discover new sessions and sessions with semantic-field changes
  for (const currSession of curr) {
    const prevSession = prevMap.get(currSession.sessionId);

    // #region START_CLASSIFY_CURRENT_SESSION
    if (!prevSession) {
      added.push(currSession);
      continue;
    }
    if (hasSemanticChange(prevSession, currSession)) {
      updated.push(currSession);
    }
    // #endregion END_CLASSIFY_CURRENT_SESSION
  }
  // #endregion END_FIND_ADDED_AND_UPDATED

  // #region START_FIND_REMOVED
  // purpose: scan previous snapshot to discover sessions that disappeared from current
  for (const prevSession of prev) {
    if (!currMap.has(prevSession.sessionId)) {
      removed.push(prevSession);
    }
  }
  // #endregion END_FIND_REMOVED

  logger.debug(
    `[diff] [comparing → done] added=${added.length} removed=${removed.length} updated=${updated.length}`
  );
  return { added, removed, updated };
}

/**
 * @purpose Check whether any semantic field differs between two sessions.
 * @param prev Previous session state.
 * @param curr Current session state.
 * @returns true if at least one semantic field value differs.
 */
function hasSemanticChange(prev: AgentSession, curr: AgentSession): boolean {
  return SEMANTIC_FIELDS.some(field => prev[field] !== curr[field]);
}
