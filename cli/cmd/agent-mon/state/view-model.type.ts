// @file: View model types — ViewModel, ProviderColumn, SessionCard for the agent-mon dashboard.
// @consumers: ui, state/create-state-manager, state/group-by-provider
// @tasks: TSK-45

/**
 * @purpose Full dashboard state snapshot consumed by the UI layer.
 * @invariant status transitions: loading → ready | error; on error, data preserves last successful scan.
 */
export type ViewModel = {
  /** @purpose Current lifecycle state of the dashboard | @invariant 'loading' before first iteration, 'ready' after, 'error' on observer failure */
  status: 'loading' | 'ready' | 'error';
  /** @purpose Aggregated dashboard data — columns and summary | @invariant Present only after first successful scan */
  data?: {
    /** @purpose Per-provider columns with grouped sessions */
    columns: ProviderColumn[];
    /** @purpose Aggregate counts across all providers */
    summary: {
      /** @purpose Total session count across all providers */
      total: number;
      /** @purpose Session count per provider key */
      byProvider: Record<string, number>;
    };
  };
  /** @purpose Error object captured on observer failure | @invariant Set only when status='error' */
  error?: Error;
  /** @purpose Timestamp of the last ViewModel update | @invariant Epoch milliseconds */
  lastUpdated: number;
};

/**
 * @purpose Column data for one provider — sessions grouped and sorted.
 * @invariant sessions are sorted: active → waiting → idle → completed.
 */
export type ProviderColumn = {
  /** @purpose Provider identifier (claude, opencode, etc.) */
  provider: string;
  /** @purpose Count of sessions in active state */
  activeCount: number;
  /** @purpose Count of sessions waiting for operator input */
  waitingCount: number;
  /** @purpose Count of idle sessions */
  idleCount: number;
  /** @purpose Sessions in this column, sorted by status priority */
  sessions: SessionCard[];
};

/**
 * @purpose Rendering data for one session card in the dashboard.
 * @invariant isWaitingForOperator is derived from isWaitingForUser heuristic applied to lastMessage.
 */
export type SessionCard = {
  /** @purpose Stable session identifier */
  sessionId: string;
  /** @purpose Display title of the session */
  title: string;
  /** @purpose AI model name used in the session */
  model?: string;
  /** @purpose Current session status — 'waiting' derived from isWaitingForUser heuristic */
  status: 'active' | 'waiting' | 'idle' | 'completed';
  /** @purpose Human-readable elapsed time string (e.g. '33m', '2.1h') */
  elapsed: string;
  /** @purpose Last message content, truncated for display */
  lastMessage?: string;
  /** @purpose Input token count */
  tokensIn?: number;
  /** @purpose Output token count */
  tokensOut?: number;
  /** @purpose CPU usage percentage | @invariant Provider-specific */
  cpuPercent?: number;
  /** @purpose Memory usage in megabytes | @invariant Provider-specific */
  memoryMb?: number;
  /** @purpose Active tasks within the session | @invariant V1 not populated, deferred */
  tasks?: { id: string; status: string; subject: string }[];
  /** @purpose Whether the session appears to be waiting for operator input */
  isWaitingForOperator: boolean;
};
