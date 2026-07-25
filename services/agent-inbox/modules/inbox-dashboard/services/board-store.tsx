// @file: BoardStore — React Context for dashboard state, polling, and optimistic updates.
// @consumers: inbox-dashboard components
// @tasks: TSK-107

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { BoardData, MrCard } from '../../inbox-api/types.ts';
import { getBoard, assignMr, setRoleActive, executeAction, getReport } from './api-client.ts';
import type { MrDetail } from '../../inbox-api/types.ts';
import { log } from './debug-log.ts';

/** @purpose Shape of the board context value exposed to consumers. */
type BoardContextValue = {
  /** @purpose Current board state, null while loading. */
  board: BoardData | null;
  /** @purpose Whether the initial fetch is in progress. */
  loading: boolean;
  /** @purpose Error message when the API is unreachable. */
  error: string | null;
  /** @purpose Number of seconds until the next poll. */
  pollCountdown: number;
  /** @purpose Manually refresh board data. */
  refresh: () => Promise<void>;
  /** @purpose Assign an MR to a role with optimistic update. */
  assignMrToRole: (mr: MrCard, targetRole: string) => Promise<void>;
  /** @purpose Toggle a role's activation state (gates auto-assignment, SV-07). */
  toggleRoleActive: (role: string, active: boolean) => Promise<void>;
  /** @purpose Execute an operator action on an MR. */
  executeMrAction: (mrId: string, questionId: string, choice: string) => Promise<void>;
  /** @purpose Fetch detailed report for an MR. */
  fetchReport: (mrId: string) => Promise<MrDetail>;
};

/** @purpose Polling interval in milliseconds. */
const POLL_INTERVAL = 30_000;

const BoardContext = createContext<BoardContextValue | null>(null);

/**
 * @purpose React Context provider for the dashboard board state.
 * @implements {BoardContextValue}
 * @param props Component props with React subtree.
 */
export function BoardStore(props: { children: ReactNode }) {
  const { children } = props;
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollCountdown, setPollCountdown] = useState(POLL_INTERVAL / 1000);

  /**
   * @purpose Fetch board data from the API and update state.
   */
  const refresh = useCallback(async () => {
    try {
      const data = await getBoard();
      // Telemetry: log every status change this poll surfaced (lane moves, role flips, new/gone
      // MRs) against the last snapshot — the "изменения статуса" half of the 🐞 user-path trace.
      setBoard((prev) => {
        const changes = diffBoardStates(prev, data);
        if (changes.length) log('state#board', changes.join(' | '));
        return data;
      });
      setError(null);
    } catch (cause) {
      setError('API недоступен');
      // Keep old board data visible on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    void refresh();

    const pollTimer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL);

    // Countdown ticker every second
    const countdownTimer = setInterval(() => {
      setPollCountdown((prev) => (prev <= 1 ? POLL_INTERVAL / 1000 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(pollTimer);
      clearInterval(countdownTimer);
    };
  }, [refresh]);

  /**
   * @purpose Assign an MR to a role with optimistic local update, rollback on failure.
   * @param mr The MR card to assign.
   * @param targetRole Target role name.
   */
  const assignMrToRole = useCallback(
    async (mr: MrCard, targetRole: string) => {
      if (!board) return;
      log('ui#assign-mr', `${mr.project}!${mr.iid}`, '→', targetRole);

      const mrId = mr.webUrl;
      const prevBoard = board;

      // Optimistic update: remove from all lanes, add to target role's inbox
      const updatedBoard = removeMrFromBoard(board, mr);
      const targetRoleBlock = updatedBoard.roles.find((r) => r.name === targetRole);
      if (targetRoleBlock) {
        targetRoleBlock.lanes.inbox = [
          ...targetRoleBlock.lanes.inbox,
          { ...mr, role: targetRole as MrCard['role'] },
        ];
      }
      setBoard({ ...updatedBoard });

      try {
        await assignMr(mrId, targetRole);
        // Do NOT re-sync immediately: POST /assign returns 200 BEFORE the server finishes
        // assignManual (getMrContext takes ~1-2s), so an immediate refresh reads stale server
        // state and clobbers the optimistic move — the card visibly flashes back to unassigned.
        // Reconcile after a short delay; the periodic poll is the backstop.
        setTimeout(() => void refresh(), 3000);
      } catch (cause) {
        setBoard(prevBoard); // Rollback on failure
        setError('Не удалось назначить MR');
      }
    },
    [board, refresh]
  );

  /**
   * @purpose Toggle a role's activation state with optimistic local update, rollback on failure.
   * @param role Role name.
   * @param active Desired activation state.
   */
  const toggleRoleActive = useCallback(
    async (role: string, active: boolean) => {
      if (!board) return;
      log('ui#role-toggle', role, active ? 'activate' : 'deactivate');

      const prevBoard = board;
      setBoard({
        ...board,
        roles: board.roles.map((r) => (r.name === role ? { ...r, active } : r)),
      });

      try {
        await setRoleActive(role, active);
        // Activation kicks a server-side tick (assign/restore) that briefly blocks the event loop;
        // an immediate refresh would race it and clobber the optimistic toggle. Reconcile after a
        // delay so the tick's assignments are visible in one clean sync; periodic poll backs it up.
        setTimeout(() => void refresh(), 3000);
      } catch (cause) {
        setBoard(prevBoard); // Rollback on failure
        setError('Не удалось изменить активность роли');
      }
    },
    [board, refresh]
  );

  /**
   * @purpose Execute an operator action on an MR.
   * @param mrId MR identifier.
   * @param questionId Question ID.
   * @param choice Operator's choice.
   */
  const executeMrAction = useCallback(
    async (mrId: string, questionId: string, choice: string) => {
      log('ui#mr-action', mrId, `q=${questionId}`, `choice=${choice}`);
      try {
        await executeAction(mrId, questionId, choice);
        await refresh();
      } catch (cause) {
        setError('Не удалось выполнить действие');
      }
    },
    [refresh]
  );

  /**
   * @purpose Fetch detailed report for an MR.
   * @param mrId MR identifier.
   * @returns Detailed MR report.
   */
  const fetchReport = useCallback(async (mrId: string): Promise<MrDetail> => {
    log('ui#open-report', mrId);
    return getReport(mrId);
  }, []);

  return (
    <BoardContext.Provider
      value={{
        board,
        loading,
        error,
        pollCountdown,
        refresh,
        assignMrToRole,
        toggleRoleActive,
        executeMrAction,
        fetchReport,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

/**
 * @purpose Hook to access the board context from any component.
 * @throws {Error} When used outside of BoardStore provider.
 * @returns Board context value.
 */
export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error('[useBoard] Must be used within BoardStore provider');
  }
  return ctx;
}

/**
 * @purpose Remove an MR card from all lanes across all roles and unassigned.
 * @param board Current board state.
 * @param mr The MR to remove.
 * @returns New board state without the MR.
 */
function removeMrFromBoard(board: BoardData, mr: MrCard): BoardData {
  const filterLane = (cards: MrCard[]) =>
    cards.filter((c) => !(c.project === mr.project && c.iid === mr.iid));

  return {
    roles: board.roles.map((role) => ({
      ...role,
      lanes: {
        inbox: filterLane(role.lanes.inbox),
        inProgress: filterLane(role.lanes.inProgress),
        awaitingMe: filterLane(role.lanes.awaitingMe),
        done: filterLane(role.lanes.done),
      },
    })),
    unassigned: filterLane(board.unassigned),
  };
}

/**
 * @purpose Flatten a board into `mrKey → placement` so two snapshots can be diffed for telemetry.
 * @param board Board snapshot.
 * @returns Map of `project!iid` to a human-readable placement (`role/lane` or `unassigned`).
 */
function placementMap(board: BoardData): Map<string, string> {
  const m = new Map<string, string>();
  for (const role of board.roles) {
    for (const [lane, cards] of Object.entries(role.lanes)) {
      for (const c of cards) m.set(`${c.project}!${c.iid}`, `${role.name}/${lane}`);
    }
  }
  for (const c of board.unassigned) m.set(`${c.project}!${c.iid}`, 'unassigned');
  return m;
}

/**
 * @purpose Diff two board snapshots into telemetry lines — role-activation flips and per-MR
 *   placement changes (lane moves, new/removed cards) — for 🐞 status-change tracing.
 * @param prev Previous board snapshot (null on first load).
 * @param next Latest board snapshot.
 * @returns Ordered change descriptions; empty when nothing moved.
 */
function diffBoardStates(prev: BoardData | null, next: BoardData): string[] {
  const changes: string[] = [];
  if (!prev) return changes;

  const prevActive = new Map(prev.roles.map((r) => [r.name, r.active]));
  for (const r of next.roles) {
    if (prevActive.get(r.name) !== r.active) {
      changes.push(`role ${r.name} ${r.active ? 'activated' : 'deactivated'}`);
    }
  }

  const before = placementMap(prev);
  const after = placementMap(next);
  for (const [mr, place] of after) {
    const was = before.get(mr);
    if (was === undefined) changes.push(`+ ${mr} appeared @ ${place}`);
    else if (was !== place) changes.push(`~ ${mr} moved ${was} → ${place}`);
  }
  for (const [mr] of before) {
    if (!after.has(mr)) changes.push(`- ${mr} left the board`);
  }
  return changes;
}
