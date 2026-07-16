// @file: SseHub — per-MR SSE subscriber registry; one broadcast channel per MR serves both token stream and mutation/refresh events to every connected client (D-100, D-110).
// @consumers: ChatRouter, MutateRouter (TSK-129)
// @tasks: TSK-129

import type { ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { ChatTurn, MutationProposal } from '../inbox-chat/types.ts';
import type { ChatErrorCode } from '../inbox-chat/errors.ts';

/** @purpose Discriminated union of every frame `SseHub` can broadcast — exhaustively handled by `_encodeFrame` (compiler-checked). */
export type SseFrame =
  | { type: 'token'; token: string }
  | { type: 'turn_done'; turn: ChatTurn }
  | { type: 'mutation'; mutation: MutationProposal }
  | { type: 'refresh' }
  | { type: 'error'; error: ChatErrorCode; detail: string }
  | { type: 'dryrun'; channel: 'mr' | 'dm'; line: string };

/**
 * @purpose Registry of active SSE connections keyed by MR reference — a single channel per MR
 * fans out token/turn_done/mutation/refresh/error frames to every subscriber (D-100).
 * @invariant One `SseHub` instance per running server process — shared by `ChatRouter` and
 * `MutateRouter` so both event families broadcast over the same per-MR channel (D-110).
 * @invariant Writing to an already-closed connection is a no-op — never throws, never drops
 * delivery to the remaining subscribers of the same MR.
 */
export class SseHub {
  /** @purpose Active SSE connections per MR reference. */
  protected _subscribers: Map<string, Set<ServerResponse>> = new Map();

  /**
   * @purpose Register an SSE connection for an MR — sends headers/retry hint, joins the broadcast set.
   * @param mrRef MR reference (`project!iid`) the connection subscribes to.
   * @param res Server response to keep open as an `text/event-stream` connection.
   * @sideEffect Writes SSE response headers and a `retry` line; mutates the subscriber registry.
   */
  subscribe(mrRef: string, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');

    let set = this._subscribers.get(mrRef);
    if (!set) {
      set = new Set();
      this._subscribers.set(mrRef, set);
    }
    set.add(res);

    logger.debug('[SseHub#subscribe] [idle → subscribed]', {
      mrRef,
      subscriberCount: set.size,
    });
  }

  /**
   * @purpose Remove a connection from an MR's broadcast set — called on the connection's `close`.
   * @param mrRef MR reference the connection was subscribed to.
   * @param res Server response to remove.
   */
  unsubscribe(mrRef: string, res: ServerResponse): void {
    const set = this._subscribers.get(mrRef);
    if (!set) return;

    set.delete(res);
    logger.debug('[SseHub#unsubscribe] [subscribed → unsubscribed]', {
      mrRef,
      subscriberCount: set.size,
    });
  }

  /**
   * @purpose Broadcast one frame to every subscriber of an MR (D-100) — both the chat token stream
   * and mutation/refresh events flow through this single method.
   * @param mrRef MR reference whose subscribers receive the frame.
   * @param frame Discriminated SSE frame to encode and send.
   * @sideEffect Writes to every open connection registered for `mrRef`; closed sockets are skipped
   * silently so the remaining subscribers still receive the frame.
   */
  broadcast(mrRef: string, frame: SseFrame): void {
    const set = this._subscribers.get(mrRef);
    if (!set || set.size === 0) return;

    const payload = this._encodeFrame(frame);

    // #region START_BEST_EFFORT_FANOUT — invariant: one dead connection must not block delivery to the rest of the MR's subscribers
    for (const res of set) {
      try {
        res.write(payload);
      } catch (cause) {
        logger.debug('[SseHub#broadcast] [subscribed → write_failed]', { mrRef, cause });
      }
    }
    // #endregion END_BEST_EFFORT_FANOUT
  }

  /**
   * @purpose Broadcast one frame to EVERY subscriber across all MR channels — used for process-wide
   * diagnostics (the dry-run journal, TSK-131) that are not scoped to a single MR's channel.
   * @param frame Discriminated SSE frame to encode and send to every open connection.
   * @sideEffect Writes to every open connection in the registry; closed sockets are skipped silently.
   */
  broadcastAll(frame: SseFrame): void {
    const payload = this._encodeFrame(frame);
    for (const set of this._subscribers.values()) {
      for (const res of set) {
        try {
          res.write(payload);
        } catch (cause) {
          logger.debug('[SseHub#broadcastAll] [subscribed → write_failed]', { cause });
        }
      }
    }
  }

  /**
   * @purpose Encode one SSE frame as wire text — named `event:` line plus a JSON `data:` line.
   * @invariant Exhaustive switch over `frame.type` — an unhandled variant fails to compile (`never`
   * branch), satisfying the union-exhaustiveness contract this module exposes.
   * @param frame Discriminated SSE frame to encode.
   * @returns SSE wire text ready to `write()` on the connection.
   */
  protected _encodeFrame(frame: SseFrame): string {
    switch (frame.type) {
      case 'token':
      case 'turn_done':
      case 'mutation':
      case 'refresh':
      case 'error':
      case 'dryrun':
        return `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`;
      default: {
        const exhaustive: never = frame;
        throw new Error(
          `[SseHub#_encodeFrame] Unhandled frame type: ${JSON.stringify(exhaustive)}`
        );
      }
    }
  }
}
