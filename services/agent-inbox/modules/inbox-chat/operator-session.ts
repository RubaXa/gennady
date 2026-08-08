// @file: Durable read-only operator conversation projected from MR journal turns.
// @consumers: ChatRouter
// @tasks: TSK-163

import { randomUUID } from 'node:crypto';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import type { Anchor } from './anchor.ts';

/** @purpose One durable operator message persisted as a `chat_turn` journal event. */
export type OperatorTurn = {
  /** @purpose Durable turn identifier. */
  turnId: string;
  /** @purpose Author role in the operator conversation. */
  role: 'operator' | 'assistant';
  /** @purpose Visible text for this durable turn. */
  text: string;
  /** @purpose Optional artifact context preserved with the turn. */
  anchor?: Anchor;
};

/** @purpose Read-only operator conversation surface; write and VCS-write tools are deliberately absent. */
export interface ChatPort {
  /**
   * @purpose Append a question and its answer to durable MR history.
   * @param mr MR key.
   * @param text Operator question.
   * @param [anchor] Optional artifact anchor.
   * @returns Assistant turn.
   */
  ask(mr: string, text: string, anchor?: Anchor): Promise<OperatorTurn>;
  /**
   * @purpose Stop any currently in-flight MR question.
   * @param mr MR key.
   * @returns Completion after cancellation.
   */
  stop(mr: string): Promise<void>;
  /**
   * @purpose Project ordered durable journal turns for one MR.
   * @param mr MR key.
   * @returns Turns oldest first.
   */
  history(mr: string): OperatorTurn[];
}

/**
 * @purpose Persist operator turns in the authoritative MR event journal and restart an overflowed context transparently.
 * @implements {ChatPort} in ./operator-session.ts
 */
export class OperatorSession implements ChatPort {
  /** @purpose MR journal backing restart-safe history. */
  protected _journal: JournalPort;
  /** @purpose Optional read-only answer source; no mutation capability is accepted by this seam. */
  protected _answer: (text: string, anchor?: Anchor, digest?: string) => Promise<string>;
  /** @purpose In-flight questions reissued after context overflow. */
  protected _inflight: Map<
    string,
    {
      mr: string;
      text: string;
      anchor?: Anchor;
      generation: number;
      cancelled: boolean;
      replacement?: OperatorTurn;
    }
  > = new Map();

  /**
   * @purpose Create a journal-backed read-only operator conversation.
   * @param deps Durable journal and optional read-only answer seam.
   */
  constructor(deps: {
    journal: JournalPort;
    answer?: (text: string, anchor?: Anchor, digest?: string) => Promise<string>;
  }) {
    this._journal = deps.journal;
    this._answer = deps.answer ?? (async (text) => `Read-only response: ${text}`);
  }

  /** @see {ChatPort#ask} in ./operator-session.ts */
  async ask(mr: string, text: string, anchor?: Anchor): Promise<OperatorTurn> {
    if (!text.trim()) throw new Error('[OperatorSession#ask] Question must not be empty');
    const turnId = `t-${randomUUID()}`;
    this._inflight.set(turnId, { mr, text, anchor, generation: 0, cancelled: false });
    await this._append(mr, { turnId, role: 'operator', text, anchor });
    try {
      const answer = await this._answer(text, anchor);
      const current = this._inflight.get(turnId);
      if (!current || current.cancelled)
        throw new Error('[OperatorSession#ask] In-flight turn was stopped');
      if (current.generation !== 0 && current.replacement) return current.replacement;
      if (current.generation !== 0)
        throw new Error('[OperatorSession#ask] In-flight turn was superseded');
      const completed: OperatorTurn = {
        turnId: `t-${randomUUID()}`,
        role: 'assistant',
        text: answer,
        anchor,
      };
      await this._append(mr, completed);
      return completed;
    } finally {
      this._inflight.delete(turnId);
    }
  }

  /** @see {ChatPort#stop} in ./operator-session.ts */
  async stop(mr: string): Promise<void> {
    for (const inflight of this._inflight.values()) {
      if (inflight.mr === mr) inflight.cancelled = true;
    }
  }

  /** @see {ChatPort#history} in ./operator-session.ts */
  history(mr: string): OperatorTurn[] {
    return this._journal
      .read()
      .filter((entry) => entry.mr === mr && entry.kind === 'chat_turn')
      .map((entry) => entry.payload as OperatorTurn)
      .filter((turn): turn is OperatorTurn => typeof turn?.turnId === 'string');
  }

  /**
   * @purpose Reissue an in-flight question after an ephemeral OpenCode context overflow using a durable thread digest.
   * @param mr MR owning the conversation.
   * @param turnId Original operator turn to reissue.
   * @returns Assistant answer in the same journal-backed history.
   */
  async restartWithDigest(mr: string, turnId: string): Promise<OperatorTurn> {
    const inflight = this._inflight.get(turnId);
    if (!inflight)
      throw new Error(`[OperatorSession#restartWithDigest] Unknown in-flight turn: ${turnId}`);
    inflight.generation += 1;
    const generation = inflight.generation;
    const digest = this.history(mr)
      .map((turn) => `${turn.role}: ${turn.text}`)
      .join('\n');
    const answer = await this._answer(inflight.text, inflight.anchor, digest);
    const current = this._inflight.get(turnId);
    if (!current || current.cancelled || current.generation !== generation) {
      throw new Error('[OperatorSession#restartWithDigest] Reissued turn was cancelled');
    }
    const completed: OperatorTurn = {
      turnId: `t-${randomUUID()}`,
      role: 'assistant',
      text: answer,
      anchor: inflight.anchor,
    };
    await this._append(mr, completed);
    current.replacement = completed;
    return completed;
  }

  /**
   * @purpose Persist a turn produced by the live HTTP/OpenCode bridge without issuing a second prompt.
   * @param mr MR owning the durable turn.
   * @param turn Already-resolved operator or assistant turn.
   * @returns Completion after the authoritative journal append.
   */
  async record(mr: string, turn: OperatorTurn): Promise<void> {
    await this._append(mr, turn);
  }

  /**
   * @purpose Register a persisted HTTP operator turn for durable overflow restart; the bridge owns
   * the initial prompt and this projection owns its handoff.
   * @param mr Canonical MR reference.
   * @param turn Persisted operator turn to make restartable.
   */
  begin(mr: string, turn: OperatorTurn): void {
    this._inflight.set(turn.turnId, {
      mr,
      text: turn.text,
      anchor: turn.anchor,
      generation: 0,
      cancelled: false,
    });
  }

  /**
   * @purpose Remove a successfully settled HTTP turn from the overflow handoff registry.
   * @param turnId Operator turn identity previously passed to `begin()`.
   */
  settle(turnId: string): void {
    this._inflight.delete(turnId);
  }

  /**
   * @purpose Append one explicitly shaped chat turn to the journal.
   * @param mr MR owning the turn.
   * @param turn Durable turn payload.
   * @returns Completion after fsync.
   */
  protected async _append(mr: string, turn: OperatorTurn): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'chat_turn',
      actor: 'operator-session',
      payload: turn,
    });
  }
}
