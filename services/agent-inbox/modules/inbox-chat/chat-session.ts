// @file: ChatSession — per-MR opencode session from the shared SessionPool: one turn at a time, stream+Stop, read/local-only tool-scope (D-88, D-103).
// @consumers: inbox-api ChatRouter (TSK-129)
// @tasks: TSK-126

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { logger } from '#logger';
import { worktreesRoot } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { SessionPool } from '../inbox-opencode/session-pool.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import { ContextAssembler } from './context-assembler.ts';
import { ChatTranscript, type TranscriptState } from './chat-transcript.ts';
import type { ChatTurn, ContextChip, MutationProposal } from './types.ts';
import { composeChatError, type ChatErrorResponse } from './errors.ts';

/** @purpose Structured-output schema for a chat turn — reuses the resultSchema contract already carried by inbox-opencode (D-90). */
const CHAT_TURN_RESULT_SCHEMA = {
  title: 'chat_turn',
  type: 'object',
  properties: {
    answer: { type: 'string' },
    mutations: { type: 'array' },
  },
} as const;

/** @purpose Outcome of `ChatSession#ask()` — the completed turn, or a `TURN_IN_FLIGHT` rejection (D-104). */
export type AskResult = { ok: true; turn: ChatTurn } | ChatErrorResponse;

/**
 * @purpose Convert an MR reference (`project!iid`) into the flat directory-name encoding shared
 * with `reports/<mr>/`/`chats/<ref>.jsonl` and worktree paths.
 * @param mrRef MR reference `project!iid`.
 * @returns Flat name `<project-with-__-for-slash>-<iid>`.
 */
function _encodeMrRef(mrRef: string): string {
  const sep = mrRef.lastIndexOf('!');
  const project = sep === -1 ? mrRef : mrRef.slice(0, sep);
  const iid = sep === -1 ? '' : mrRef.slice(sep + 1);
  return `${project.replace(/\//g, '__')}-${iid}`;
}

/**
 * @purpose Holds one canonical opencode session per MR — grounded Q&A over report artifacts +
 * diff, streamed answer, structural mutation proposals, single-flight turn serialization.
 * @invariant No vcs-* write tool ever reaches the session — `SessionPool#create`'s options carry
 * only `title`/`directory`, no tool selector at all (D-103).
 * @invariant `sid` server-issued, one per MR, lazy-created, reused (D-100, D-102, SV-11).
 * @invariant No incremental token event exists yet — `onToken` replays the resolved answer
 * post-resolution; `stop()` truncates that replay (Handoff `open`).
 */
export class ChatSession {
  /** @purpose MR reference `project!iid` this session is bound to */
  readonly mrRef: string;
  /** @purpose Server-issued session id from SessionPool, or null before the first ask() */
  sid: string | null = null;
  /** @purpose True while a turn is in flight — gates `ask()` per D-104 */
  busy = false;
  /** @purpose Chips attached to the most recent turn — current chat context */
  activeChips: ContextChip[] = [];

  /** @purpose Shared opencode session pool (SV-11, D-102) */
  protected _pool: SessionPool;
  /** @purpose Gennady state root (NFC-05) */
  protected _stateDir: string;
  /** @purpose Per-turn context builder */
  protected _assembler: ContextAssembler;
  /** @purpose Persistent transcript accessor */
  protected _transcript: ChatTranscript;
  /** @purpose Turns loaded/appended so far, oldest first */
  protected _turns: ChatTurn[] = [];
  /** @purpose Set by `stop()`; checked between streamed chunks to truncate the in-flight turn */
  protected _stopRequested = false;
  /** @purpose Subscribers for streamed answer chunks (SSE bridge, TSK-129) */
  protected _tokenListeners: Array<(token: string) => void> = [];
  /** @purpose Subscribers for proposed mutations (SSE bridge, TSK-129) */
  protected _mutationListeners: Array<(mutation: MutationProposal) => void> = [];

  /**
   * @purpose Create a session bound to one MR — lazy, no I/O until the first `ask()`/`rehydrate()`.
   * @param deps Shared pool, state store, and context assembler for this session.
   */
  constructor(deps: {
    pool: SessionPool;
    store: StateStore;
    assembler: ContextAssembler;
    mrRef: string;
  }) {
    this._pool = deps.pool;
    this._stateDir = deps.store.getStateDir();
    this._assembler = deps.assembler;
    this._transcript = new ChatTranscript(this._stateDir);
    this.mrRef = deps.mrRef;
  }

  /**
   * @returns Current in-memory transcript state (turns + active chips).
   */
  get transcript(): TranscriptState {
    return { turns: this._turns, activeChips: this.activeChips };
  }

  /**
   * @purpose Restore transcript + active chips from disk on reconnect/server restart (D-97, SV-13).
   * @returns Promise that resolves once in-memory state matches the persisted transcript.
   * @sideEffect Filesystem read via `ChatTranscript#load`.
   */
  async rehydrate(): Promise<void> {
    const persisted = await this._transcript.load(this.mrRef);
    this._turns = persisted.turns;
    this.activeChips = persisted.activeChips;
    logger.debug('[ChatSession#rehydrate] [idle → rehydrated]', {
      mrRef: this.mrRef,
      turnCount: this._turns.length,
    });
  }

  /**
   * @purpose Subscribe to streamed answer chunks for the SSE bridge (`inbox-api`, TSK-129).
   * @param cb Called with each chunk as it is emitted.
   */
  onToken(cb: (token: string) => void): void {
    this._tokenListeners.push(cb);
  }

  /**
   * @purpose Subscribe to proposed mutations for the SSE bridge (`inbox-api`, TSK-129).
   * @param cb Called once per mutation the assistant proposes in a turn.
   */
  onMutationProposed(cb: (mutation: MutationProposal) => void): void {
    this._mutationListeners.push(cb);
  }

  /**
   * @purpose Run one turn: assemble context, prompt the session, stream the answer, persist the turn.
   * @invariant One turn at a time per `sid` — a second `ask()` while a turn is in flight is rejected
   * with `TURN_IN_FLIGHT`, never queued (D-104).
   * @pre `text` is a non-empty string; MR worktree already prepared upstream (inbox-context/serve prep).
   * @param opts Question text and attached context chips.
   * @throws {Error} Session creation fails at the adapter level (network/process failure).
   * @returns Completed turn, or `TURN_IN_FLIGHT` when a turn is already running.
   * @sideEffect Network: one opencode prompt call. Filesystem: appends the completed turn to the transcript.
   */
  async ask(opts: { text: string; chips: ContextChip[] }): Promise<AskResult> {
    if (this.busy) {
      return composeChatError(
        'TURN_IN_FLIGHT',
        `Turn already in flight on sid=${this.sid ?? '(not yet created)'}`
      );
    }

    this.busy = true;
    this._stopRequested = false;

    try {
      if (!this.sid) {
        this.sid = await this._pool.create({
          title: `chat:${this.mrRef}`,
          directory: join(worktreesRoot(this._stateDir), _encodeMrRef(this.mrRef)),
        });
      }

      const context = await this._assembler.assemble({ mrRef: this.mrRef, chips: opts.chips });

      const promptResult = await this._pool.prompt(this.sid, {
        system: context.system,
        text: opts.text,
        format: { type: 'json_schema', schema: CHAT_TURN_RESULT_SCHEMA },
      });

      if (!promptResult.ok) {
        logger.warn('[ChatSession#ask] [prompting → session_error]', {
          mrRef: this.mrRef,
          class: promptResult.error.class,
        });
        return composeChatError(
          'SESSION_ERROR',
          promptResult.error.signal ?? `opencode prompt failed (${promptResult.error.class})`,
          promptResult.error
        );
      }

      const answerFull =
        typeof promptResult.output['answer'] === 'string'
          ? (promptResult.output['answer'] as string)
          : '';
      const mutations = Array.isArray(promptResult.output['mutations'])
        ? (promptResult.output['mutations'] as MutationProposal[])
        : undefined;

      const emitted = await this._streamAnswer(answerFull);
      const stopped = this._stopRequested && emitted.length < answerFull.length;

      const turn: ChatTurn = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        question: opts.text,
        chips: opts.chips,
        answer: stopped ? emitted : answerFull,
        reviewRevision: context.reviewRevision,
        ...(mutations ? { mutations } : {}),
        ...(stopped ? { stopped: true } : {}),
      };

      this._turns.push(turn);
      this.activeChips = opts.chips;
      await this._transcript.append(this.mrRef, turn);

      if (mutations) {
        for (const mutation of mutations) {
          for (const cb of this._mutationListeners) cb(mutation);
        }
      }

      logger.debug('[ChatSession#ask] [prompting → done]', {
        mrRef: this.mrRef,
        stopped: turn.stopped ?? false,
      });
      return { ok: true, turn };
    } finally {
      this.busy = false;
    }
  }

  /**
   * @purpose Stop the in-flight turn — ack is synchronous (<200ms per D-95/CH-11); already-streamed
   * text is preserved in the turn's `answer` once `ask()` settles.
   * @invariant Cannot interrupt the underlying network call mid-flight (no `abort` exposed through
   * `SessionPool`); only truncates the post-resolution replay loop (see Handoff `open`).
   * @returns Promise that resolves once the stop flag is set.
   */
  async stop(): Promise<void> {
    this._stopRequested = true;
  }

  /**
   * @param answerFull Full resolved answer text from the prompt call.
   * @returns Text actually emitted — equals `answerFull` unless `stop()` truncated the replay.
   * @sideEffect Invokes all `onToken` subscribers once per emitted word.
   */
  protected async _streamAnswer(answerFull: string): Promise<string> {
    if (answerFull.length === 0) return '';

    const words = answerFull.split(/(?<=\s)/);
    let emitted = '';

    // #region START_REPLAY_WITH_STOP_TRUNCATION — invariant: yields per word so a concurrent stop() gets a scheduling window before the next chunk emits
    for (const word of words) {
      if (this._stopRequested) break;
      emitted += word;
      for (const cb of this._tokenListeners) cb(word);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    // #endregion END_REPLAY_WITH_STOP_TRUNCATION

    return emitted;
  }
}
