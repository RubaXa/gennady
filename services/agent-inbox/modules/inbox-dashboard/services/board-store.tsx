// @file: BoardStore — React Context for dashboard state, polling, and optimistic updates.
// @consumers: inbox-dashboard components
// @tasks: TSK-107

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { BoardData, MrCard } from '../../inbox-api/types.ts';
import { getBoard, assignMr, executeAction, getReport } from './api-client.ts';
import type { MrDetail } from '../../inbox-api/types.ts';

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
      setBoard(data);
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
        await refresh(); // Re-sync with server state
      } catch (cause) {
        setBoard(prevBoard); // Rollback on failure
        setError('Не удалось назначить MR');
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
