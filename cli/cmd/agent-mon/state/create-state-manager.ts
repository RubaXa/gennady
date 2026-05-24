// @file: State manager factory — merges SessionChanges into a ViewModel and notifies subscribers.
// @consumers: ui/app (via gennady agent-mon)
// @tasks: TSK-45

import type { AgentSession } from '../../../../services/agent-mon/model/agent-session.type.ts';
import type { SessionChanges } from '../../../../services/agent-mon/model/session-changes.type.ts';
import type { ViewModel } from './view-model.type.ts';
import { groupByProvider } from './group-by-provider.ts';
import { isWaitingForUser } from './is-waiting.ts';
import { logger } from '#logger';

/**
 * @purpose Public interface of the state manager — query current ViewModel and subscribe to updates.
 * @invariant getViewModel() always returns the latest snapshot; subscribe fires immediately with current state.
 */
export type StateManager = {
    /** @purpose Retrieve the current ViewModel snapshot.
     * @returns Current immutable copy. */
  getViewModel(): ViewModel;
    /**
     * @purpose Register a callback invoked on every ViewModel update, including the current state immediately.
     * @param fn Callback receiving the updated ViewModel.
     * @returns Unsubscribe function — call to stop receiving updates.
     */
  subscribe(fn: (vm: ViewModel) => void): () => void;
};

/**
 * @purpose Merge SessionChanges into the current session list — add added, remove removed, replace updated.
 * @invariant Matches by sessionId; added sessions are appended; updated sessions replace by index.
 */
function applySessionChanges(
  current: AgentSession[],
  changes: SessionChanges,
): AgentSession[] {
  // #region START_REMOVE_STALE_SESSIONS — invariant: removal by sessionId; non-existent IDs safely ignored
  const removedIds = new Set(changes.removed.map((s) => s.sessionId));
  let result = current.filter((s) => !removedIds.has(s.sessionId));
  // #endregion END_REMOVE_STALE_SESSIONS

  // #region START_APPLY_UPDATES — invariant: updated sessions replace existing by sessionId; non-existent IDs appended as safety fallback
  const unappliedUpdated: AgentSession[] = [];
  result = result.map((s) => {
    const update = changes.updated.find((u) => u.sessionId === s.sessionId);
    return update ?? s;
  });
  for (const u of changes.updated) {
    if (!result.some((s) => s.sessionId === u.sessionId)) {
      unappliedUpdated.push(u);
    }
  }
  // #endregion END_APPLY_UPDATES

  // #region START_APPEND_NEW_SESSIONS — invariant: added and unapplied-updated sessions appended at end; subsequent sort in groupByProvider handles ordering
  result.push(...changes.added);
  result.push(...unappliedUpdated);
  // #endregion END_APPEND_NEW_SESSIONS

  return result;
}

/**
 * @purpose Build a ViewModel from the current session list using groupByProvider aggregation.
 * @invariant summary.byProvider entries correspond to ProviderColumn.provider keys.
 */
function buildViewModel(sessions: AgentSession[], limit?: number): ViewModel {
  const columns = groupByProvider(sessions, { isWaitingFn: isWaitingForUser, limit });
  const byProvider: Record<string, number> = {};
  for (const col of columns) {
    byProvider[col.provider] = col.sessions.length;
  }

  return {
    status: 'ready',
    data: {
      columns,
      summary: {
        total: sessions.length,
        byProvider,
      },
    },
    lastUpdated: Date.now(),
  };
}

/**
 * @purpose Create a state manager that consumes SessionChanges from an async iterable.
 * @implements {StateManager} in ./create-state-manager.ts
 * @invariant Subscribers receive the current ViewModel immediately on subscribe; status='loading' until first iteration.
 * @invariant On observer error: status transitions to 'error', data preserves last successful scan.
 * @param changes Async iterable of SessionChanges — produced by the agent-mon observe() pipeline.
 * @param opts Optional configuration to control per-provider session limit.
 * @returns StateManager instance with getViewModel and subscribe methods.
 * @sideEffect Spawns background async iteration over changes; notifies subscribers on each update.
 */
export function createStateManager(
  changes: AsyncIterable<SessionChanges>,
  opts?: { limit?: number },
): StateManager {
  const subscribers: Array<(vm: ViewModel) => void> = [];
  let sessions: AgentSession[] = [];
  let viewModel: ViewModel = { status: 'loading', lastUpdated: Date.now() };

  logger.debug('[createStateManager] [idle → initializing] State manager created');

  const notify = () => {
    for (const fn of subscribers) fn(viewModel);
  };

  // #region START_BACKGROUND_ITERATION — invariant: errors are caught, error state preserves last data; subscribers notified on every transition
  (async () => {
    try {
      for await (const change of changes) {
        sessions = applySessionChanges(sessions, change);
        viewModel = buildViewModel(sessions, opts?.limit);
        logger.debug(
          `[createStateManager] [iterating → ready] sessions=${sessions.length} columns=${viewModel.data?.columns.length ?? 0}`,
        );
        notify();
      }
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause
          : new Error('[createStateManager] Observer iteration failed', { cause });
      viewModel = {
        status: 'error',
        data: viewModel.data,
        error,
        lastUpdated: Date.now(),
      };
      logger.error('[createStateManager] [iterating → error] Observer iteration failed', {
        error,
      });
      notify();
    }
  })();
  // #endregion END_BACKGROUND_ITERATION

  return {
    /** @see {StateManager#getViewModel} in ./create-state-manager.ts */
    getViewModel: () => viewModel,

    /** @see {StateManager#subscribe} in ./create-state-manager.ts */
    subscribe: (fn: (vm: ViewModel) => void): (() => void) => {
      subscribers.push(fn);
      // immediate emit — first call before iteration → status='loading' per contract
      fn(viewModel);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
  };
}
