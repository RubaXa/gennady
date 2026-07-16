// @file: ChatApiClient — fetch+SSE client for the review-chat routes; separate from ApiClient (D-114).
// @consumers: ChatPanel, MrDetailPage
// @tasks: TSK-130

import type { ChatTurn, ContextChip, MutationProposal } from '../../inbox-chat/types.ts';
import type { ChatErrorCode } from '../../inbox-chat/errors.ts';
import type { SseFrame } from '../../inbox-api/sse-hub.ts';

/** @purpose Base URL for the inbox-api server (default port 4174), mirrors ApiClient's BASE_URL. */
const BASE_URL = 'http://localhost:4174';

/** @purpose Initial SSE reconnect delay; doubles on each consecutive failure up to MAX_RECONNECT_DELAY_MS. */
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/** @purpose Ceiling for the SSE reconnect backoff — prevents unbounded delay growth on a long outage. */
const MAX_RECONNECT_DELAY_MS = 16_000;

/** @purpose Turn contents posted to `POST /api/mr/:id/chat`. */
export type ChatTurnRequest = {
  /** @purpose Operator's question text */
  text: string;
  /** @purpose Context chips attached to this turn */
  chips?: ContextChip[];
};

/** @purpose Outcome of `ChatApiClient#mutate` — CAS success carries the new snapshot/revision; conflict is a typed STALE_REVISION, never thrown (D-99). */
export type ChatMutateResult =
  | { ok: true; snapshot: string; revision: number }
  | { ok: false; error: 'STALE_REVISION' };

/**
 * @purpose SSE frame handlers passed to `subscribe` — one callback per `SseFrame` variant; callers
 * implement only the frames they care about.
 */
export type ChatStreamHandlers = {
  /**
   * @purpose Fired for each streamed answer token
   * @param token One decoded token chunk.
   */
  onToken?: (token: string) => void;
  /**
   * @purpose Fired once the assistant's turn completes
   * @param turn The completed chat turn.
   */
  onTurnDone?: (turn: ChatTurn) => void;
  /**
   * @purpose Fired when the assistant proposes a mutation
   * @param mutation Proposed mutation.
   */
  onMutation?: (mutation: MutationProposal) => void;
  /** @purpose Fired when review.json changed underneath — caller re-reads detail/artifacts. */
  onRefresh?: () => void;
  /**
   * @purpose Fired on a server-reported error frame
   * @param error Error code
   * @param detail Human-readable detail.
   */
  onError?: (error: ChatErrorCode, detail: string) => void;
};

/**
 * @purpose Thin fetch wrapper mirroring ApiClient's `request` — JSON parsing, non-ok raises with Trace-Prefix.
 * @param path URL path relative to BASE_URL.
 * @param options fetch options.
 * @returns Parsed JSON response.
 * @throws {Error} On network failure or non-ok response.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`[ChatApiClient#request] HTTP ${res.status} ${res.statusText} for ${path}`);
  }

  return res.json() as Promise<T>;
}

/**
 * @purpose Fetch+SSE client for review-chat: ask/stop/mutate/undo plus a resilient SSE subscription
 * — kept separate from `ApiClient` since it owns a stateful streaming lifecycle (D-114).
 * @invariant `subscribe` reconnects with exponential backoff on an unexpected SSE disconnect;
 * an explicit `unsubscribe()` call never triggers a reconnect attempt.
 */
export class ChatApiClient {
  /**
   * @purpose Post an operator turn via `POST /api/mr/:id/chat` — the answer streams back over SSE,
   * never in this response.
   * @param mrId MR identifier (e.g. "group/project!510").
   * @param turn Question text and attached context chips.
   * @throws {Error} On network failure, or non-2xx (e.g. 409 TURN_IN_FLIGHT — should not occur since
   *   Send is disabled in-flight, D-104).
   * @returns Promise that resolves once the server has accepted the turn.
   * @sideEffect Network: POST /api/mr/:id/chat
   */
  async postTurn(mrId: string, turn: ChatTurnRequest): Promise<void> {
    await request(`/api/mr/${encodeURIComponent(mrId)}/chat`, {
      method: 'POST',
      body: JSON.stringify(turn),
    });
  }

  /**
   * @purpose Interrupt the current in-flight turn via `POST /api/mr/:id/chat/stop` (CH-11).
   * @param mrId MR identifier.
   * @throws {Error} On network failure or non-2xx response.
   * @returns Promise that resolves once the stop request is accepted.
   * @sideEffect Network: POST /api/mr/:id/chat/stop
   */
  async stop(mrId: string): Promise<void> {
    await request(`/api/mr/${encodeURIComponent(mrId)}/chat/stop`, { method: 'POST' });
  }

  /**
   * @purpose Apply an assistant-proposed mutation via `POST /api/mr/:id/mutate` — revision-CAS
   * against `review.json` (D-99).
   * @param mrId MR identifier.
   * @param proposal Mutation to apply.
   * @param revision `review.json` revision the proposal was computed against.
   * @throws {Error} On network failure (transport error, not a CAS conflict).
   * @returns Discriminated outcome: success carries the new snapshot id/revision; conflict is
   *   `{ ok:false, error:'STALE_REVISION' }` — never thrown, so the caller shows a banner (D-99).
   * @sideEffect Network: POST /api/mr/:id/mutate
   */
  async mutate(
    mrId: string,
    proposal: MutationProposal,
    revision: number
  ): Promise<ChatMutateResult> {
    const url = `${BASE_URL}/api/mr/${encodeURIComponent(mrId)}/mutate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal, revision }),
    });

    // #region START_HANDLE_STALE_REVISION — invariant: 409 is a typed outcome, not a thrown error (D-99)
    if (res.status === 409) {
      return { ok: false, error: 'STALE_REVISION' };
    }
    // #endregion END_HANDLE_STALE_REVISION

    if (!res.ok) {
      throw new Error(`[ChatApiClient#mutate] HTTP ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ChatMutateResult;
  }

  /**
   * @purpose Restore `review.json` to a prior snapshot via `POST /api/mr/:id/chat/undo` (CH-10).
   * @param mrId MR identifier.
   * @param snapshotId Snapshot id returned by a prior successful `mutate` call.
   * @throws {Error} On network failure or non-2xx (e.g. 404 unknown snapshot).
   * @returns Promise that resolves once the snapshot has been restored.
   * @sideEffect Network: POST /api/mr/:id/chat/undo
   */
  async undo(mrId: string, snapshotId: string): Promise<void> {
    await request(`/api/mr/${encodeURIComponent(mrId)}/chat/undo`, {
      method: 'POST',
      body: JSON.stringify({ snapshotId }),
    });
  }

  /**
   * @purpose Subscribe to the MR's SSE channel via `GET /api/mr/:id/chat/stream`; reconnects with
   * exponential backoff on an unexpected disconnect.
   * @param mrId MR identifier.
   * @param handlers Callbacks for each `SseFrame` variant the caller wants to observe.
   * @returns Unsubscribe function — closes the connection and cancels any pending reconnect.
   * @sideEffect Network: opens a long-lived EventSource connection to GET /api/mr/:id/chat/stream.
   */
  subscribe(mrId: string, handlers: ChatStreamHandlers): () => void {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let closedByCaller = false;

    /**
     * @purpose Route one decoded SSE frame to its matching handler — exhaustive switch mirrors
     * `SseHub#_encodeFrame`'s union so an unhandled variant is a compile-time error.
     * @param frame Decoded frame from the wire.
     */
    const dispatchFrame = (frame: SseFrame) => {
      switch (frame.type) {
        case 'token':
          handlers.onToken?.(frame.token);
          return;
        case 'turn_done':
          handlers.onTurnDone?.(frame.turn);
          return;
        case 'mutation':
          handlers.onMutation?.(frame.mutation);
          return;
        case 'refresh':
          handlers.onRefresh?.();
          return;
        case 'error':
          handlers.onError?.(frame.error, frame.detail);
          return;
        default: {
          const exhaustive: never = frame;
          throw new Error(
            `[ChatApiClient#subscribe] Unhandled frame type: ${JSON.stringify(exhaustive)}`
          );
        }
      }
    };

    /**
     * @purpose Open a fresh EventSource and wire up per-frame listeners plus disconnect/backoff.
     * @sideEffect Network: opens `GET /api/mr/:id/chat/stream`.
     */
    const openConnection = () => {
      const url = `${BASE_URL}/api/mr/${encodeURIComponent(mrId)}/chat/stream`;
      source = new EventSource(url);

      const onNamedEvent = (ev: MessageEvent<string>) => {
        dispatchFrame(JSON.parse(ev.data) as SseFrame);
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS; // reset backoff after any successful frame
      };
      source.addEventListener('token', onNamedEvent);
      source.addEventListener('turn_done', onNamedEvent);
      source.addEventListener('mutation', onNamedEvent);
      source.addEventListener('refresh', onNamedEvent);
      source.addEventListener('error', (ev: Event) => {
        // #region START_DISTINGUISH_DATA_ERROR_FROM_TRANSPORT_ERROR — invariant: a named `event: error` SSE frame arrives as MessageEvent (has `data`); a connection failure is a bare Event
        if (ev instanceof MessageEvent) {
          onNamedEvent(ev);
          return;
        }
        // #endregion END_DISTINGUISH_DATA_ERROR_FROM_TRANSPORT_ERROR

        source?.close();
        if (closedByCaller) return;

        reconnectTimer = setTimeout(openConnection, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      });
    };

    openConnection();

    return () => {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }
}
