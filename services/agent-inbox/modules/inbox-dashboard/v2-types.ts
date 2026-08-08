// @file: Dashboard v2 types — browser-side mirror of canonical inbox-api DTOs.
// @consumers: dashboard-v2-api, dashboard-v2-ui
// @tasks: TSK-164

/** @purpose Attention lane assigned by the server; the browser never derives it locally. */
export type Attention = '⏳' | '💬' | '🔀' | '✅' | '😴';

/** @purpose Durable work lifecycle rendered on an attention card. */
export type WorkState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting_dep'
  | 'done'
  | 'failed'
  | 'cancelled';

/** @purpose Canonical board card transported by `/api/board` and `/api/state`. */
export type MrCardV2 = {
  /** @purpose Composite `project!iid` identity for all MR-scoped routes. */
  ref: string;
  /** @purpose Latest synchronized merge-request title. */
  title: string;
  /** @purpose VCS author displayed in the identity row. */
  author: string;
  /** @purpose Current operator role, absent when it is not known. */
  myRole: string | null;
  /** @purpose Server-computed attention lane. */
  attention: Attention;
  /** @purpose Server counters rendered as the card's canonical badge row. */
  counters: {
    /** @purpose Approval progress text. */
    approvals: string;
    /** @purpose Reviewer voting states. */
    reviewers: { user: string; voted: boolean }[];
    /** @purpose CI state, or null before VCS has supplied it. */
    ci: string | null;
    /** @purpose Thread progress text. */
    threads: string;
    /** @purpose Threads currently awaiting the operator. */
    awaitingMe: number;
    /** @purpose New commit count since the last review. */
    newCommits: number;
    /** @purpose Unread feed-event count. */
    unread: number;
  };
  /** @purpose Durable task state shown as the fourth row. */
  work: { state: WorkState; label: string; taskId?: string; startedAt: string | null };
};

/** @purpose Server-projected feed widget with stable identity and durable anchors. */
export type FeedWidget = {
  /** @purpose Stable widget identity used by reconciliation. */
  widgetId: string;
  /** @purpose Rendering and action policy discriminator. */
  type: 'findings' | 'threads' | 'artifact' | 'gitlab' | 'plan' | 'progress' | 'action';
  /** @purpose ISO timestamp of the last server activity. */
  lastActivity: string;
  /** @purpose One-shot widgets disappear when resolved. */
  resolved: boolean;
  /** @purpose Whether this widget was created after lastReadAt. */
  unread: boolean;
  /** @purpose Durable sources that can become a chat anchor. */
  anchors: {
    /** @purpose Owning widget identifier. */
    widgetId: string;
    /** @purpose Optional artifact path. */
    artifactPath?: string;
    /** @purpose Optional DOM/logical element identifier. */
    elementId?: string;
    /** @purpose Optional selected quote. */
    quote?: string;
    /** @purpose Optional character fragment in the quote. */
    fragment?: { start: number; end: number };
  }[];
  /** @purpose Type-specific server payload; never a client-side source of truth. */
  payload: Record<string, unknown>;
};

/** @purpose Durable chat transcript item projected from the MR journal. */
export type ChatTranscriptTurn = {
  /** @purpose Stable journal turn identity. */
  turnId: string;
  /** @purpose Speaker retained across a page reload or server restart. */
  role: 'operator' | 'assistant';
  /** @purpose Visible message text. */
  text: string;
  /** @purpose Optional selected source context. */
  anchor?: FeedWidget['anchors'][number];
};

/** @purpose Board snapshot projected from live VCS and durable journals. */
export type BoardV2 = {
  /** @purpose Lane-to-MR membership supplied by the API. */
  groups: Record<Attention, string[]>;
  /** @purpose Canonical cards to render in those lanes. */
  cards: MrCardV2[];
  /** @purpose Sync health; degraded means last confirmed data remains visible, syncing means the first truth load is still in flight. */
  syncState: 'ok' | 'degraded' | 'syncing';
};

/** @purpose Observable boot readiness used by LoadingScreen. */
export type BootV2 = {
  /** @purpose Current boot phase name. */
  phase: string;
  /** @purpose True once all mandatory bootstrap work completed. */
  ready: boolean;
  /** @purpose Optional phase progress. */
  progress?: { done: number; total: number; label: string };
  /** @purpose Visible phase failure message. */
  error?: string;
  /** @purpose Whether local runtime configuration is usable. */
  configured: boolean;
  /** @purpose Missing configuration keys when not configured. */
  missing: string[];
};

/** @purpose Per-MR state reconciled while a feed is open. */
export type MrStateV2 = {
  /** @purpose Current card, absent before first projection. */
  card?: MrCardV2;
  /** @purpose Ordered durable tasks for the MR. */
  queue: { taskId: string; type: string; status: string; position: number }[];
  /** @purpose Current feed widgets. */
  widgets: FeedWidget[];
  /** @purpose Journal-backed conversation history, oldest first. */
  transcript?: ChatTranscriptTurn[];
};
