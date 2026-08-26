// @file: MockAgent — a harness-local AgentPort that replays programmed turns (writing real files) so
//   the whole orchestration + verification chain runs with no network and no model spend.
// @consumers: harness/__tests__/harness.mock.test.ts, harness self-tests
// @tasks: N/A (eval harness, not published)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AgentPort,
  type AgentSessionOpts,
  type AgentPromptOpts,
  type AgentTurnResult,
} from './agent.port.ts';

/** @purpose One file the mock agent "writes" during a turn — path is relative to the session dir. */
export type MockWrite = {
  /** @purpose Path relative to the session directory. */
  path: string;
  /** @purpose File contents written verbatim. */
  content: string;
};

/**
 * @purpose A programmed turn: the files this turn writes, the text it returns, or a forced failure.
 * @invariant `fail` set → the turn returns a failed result and writes nothing.
 */
export type MockTurn = {
  /** @purpose Files written into the session directory this turn (real disk writes). */
  writes?: MockWrite[];
  /** @purpose Reply text for a successful turn. */
  text?: string;
  /** @purpose When set, the turn fails with this message and writes nothing. */
  fail?: string;
};

/**
 * @purpose Deterministic AgentPort that replays a fixed sequence of turns, writing real files so
 *   downstream verification (`npm test`, app run) exercises genuine artifacts.
 * @invariant Turns are consumed FIFO across prompt() and continue() alike; once exhausted, further
 *   turns succeed as no-ops (empty writes) — the flow is driven by the seeded script, not by count.
 * @consumers harness self-tests
 */
export class MockAgent extends AgentPort {
  /** @purpose Remaining programmed turns, consumed front-to-back. */
  private _turns: MockTurn[];
  /** @purpose Session directory per sid — the write root for that session's turns. */
  private _dirs = new Map<string, string>();
  /** @purpose Accumulated tool-trace per sid, preserved across continue() turns. */
  private _trace = new Map<string, { tool: string; input: string }[]>();
  /** @purpose Counter for unique session ids. */
  private _counter = 0;

  /**
   * @param turns The ordered turns to replay. Defaults to an empty script (all no-ops).
   */
  constructor(turns: MockTurn[] = []) {
    super();
    this._turns = [...turns];
  }

  /** @see {AgentPort#createSession} */
  async createSession(opts: AgentSessionOpts): Promise<{ sid: string }> {
    const sid = `mock-${++this._counter}`;
    this._dirs.set(sid, opts.directory);
    this._trace.set(sid, []);
    return { sid };
  }

  /** @see {AgentPort#prompt} */
  async prompt(sid: string, _opts: AgentPromptOpts): Promise<AgentTurnResult> {
    return this._runTurn(sid);
  }

  /** @see {AgentPort#continue} */
  async continue(sid: string, _opts: AgentPromptOpts): Promise<AgentTurnResult> {
    return this._runTurn(sid);
  }

  /** @see {AgentPort#close} */
  async close(sid: string): Promise<void> {
    this._dirs.delete(sid);
    this._trace.delete(sid);
  }

  /**
   * @purpose Consume and execute the next programmed turn for a session — write its files, extend
   *   the trace, and return the outcome (or a no-op success when the script is exhausted).
   * @param sid Session whose next turn runs.
   * @returns The turn outcome carrying the session's accumulated trace.
   */
  private _runTurn(sid: string): AgentTurnResult {
    const dir = this._dirs.get(sid);
    const trace = this._trace.get(sid);
    if (!dir || !trace) {
      return { ok: false, error: `Unknown session ${sid}`, trace: [] };
    }
    const turn = this._turns.shift() ?? {};
    if (turn.fail) {
      return { ok: false, error: turn.fail, trace: [...trace] };
    }
    for (const w of turn.writes ?? []) {
      const abs = join(dir, w.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, w.content);
      trace.push({ tool: 'write', input: w.path });
    }
    return { ok: true, text: turn.text ?? 'ok', trace: [...trace] };
  }
}
