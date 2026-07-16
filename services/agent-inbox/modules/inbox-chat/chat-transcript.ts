// @file: ChatTranscript — append-only per-MR jsonl transcript (chats/<ref>.jsonl), rehydrated on reconnect/restart, by the audit.jsonl pattern (D-97).
// @consumers: ChatSession
// @tasks: TSK-126

import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type { ChatTurn, ContextChip } from './types.ts';

/** @purpose Rehydrated transcript state for one MR — full turn history + chips active in the most recent turn. */
export type TranscriptState = {
  /** @purpose Turns in append order, oldest first */
  turns: ChatTurn[];
  /** @purpose Chips attached to the most recent turn — current chat context (empty when there are no turns) */
  activeChips: ContextChip[];
};

/**
 * @purpose Convert an MR reference (`project!iid`) into the flat directory/file-name encoding
 * shared with `reports/<mr>/` (`state-paths.logic.ts#mrReportsDir`) and worktree paths.
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
 * @purpose Append-only JSON Lines transcript, one file per MR, surviving server restart (D-97, SV-13).
 * @invariant Append-only: existing lines are never modified or removed.
 * @invariant Missing file degrades to an empty transcript, never an error — symmetric with `InboxRegistry.load()`.
 */
export class ChatTranscript {
  /** @purpose Gennady state root (NFC-05) — never `os.tmpdir()` */
  protected _stateDir: string;

  /**
   * @purpose Create a transcript accessor bound to a state directory.
   * @param stateDir Gennady state root.
   */
  constructor(stateDir: string) {
    this._stateDir = stateDir;
  }

  /**
   * @param mrRef MR reference `project!iid`.
   * @returns Absolute path to `<state-dir>/agent-inbox/chats/<group__proj-iid>.jsonl`.
   */
  path(mrRef: string): string {
    return join(this._stateDir, 'agent-inbox', 'chats', `${_encodeMrRef(mrRef)}.jsonl`);
  }

  /**
   * @purpose Load the persisted transcript for an MR, rehydrating turns and the active chip set.
   * @param mrRef MR reference `project!iid`.
   * @throws {Error} File exists but cannot be read (I/O failure — malformed lines are skipped, not thrown).
   * @returns Turns oldest-first and chips from the most recent turn; empty transcript when the file is absent (CH-13).
   * @sideEffect Filesystem read.
   */
  async load(mrRef: string): Promise<TranscriptState> {
    const filePath = this.path(mrRef);
    if (!existsSync(filePath)) {
      logger.debug('[ChatTranscript#load] [idle → empty] No transcript file yet', { mrRef });
      return { turns: [], activeChips: [] };
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const turns: ChatTurn[] = [];

      // #region START_PARSE_JSONL_LINES — invariant: a malformed line is skipped, never aborts the whole rehydrate (symmetric with AuditLog#query)
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          turns.push(JSON.parse(line) as ChatTurn);
        } catch (cause) {
          logger.warn('[ChatTranscript#load] [reading → skip_malformed_line]', { mrRef, cause });
        }
      }
      // #endregion END_PARSE_JSONL_LINES

      const lastTurn = turns.at(-1);
      logger.debug('[ChatTranscript#load] [empty → loaded]', { mrRef, turnCount: turns.length });
      return { turns, activeChips: lastTurn?.chips ?? [] };
    } catch (cause) {
      const error = new Error(`[ChatTranscript#load] Failed to read transcript for ${mrRef}`, {
        cause,
      });
      logger.error('[ChatTranscript#load] [loading → failed]', { error });
      throw error;
    }
  }

  /**
   * @purpose Append one completed turn to the MR's transcript, creating `chats/` lazily on first write.
   * @param mrRef MR reference `project!iid`.
   * @param turn Completed turn to persist.
   * @throws {Error} Directory creation or append fails.
   * @returns Promise that resolves when the line is appended.
   * @sideEffect Filesystem: creates `<state-dir>/agent-inbox/chats/` on first call; appends one JSON line.
   */
  async append(mrRef: string, turn: ChatTurn): Promise<void> {
    const filePath = this.path(mrRef);

    try {
      await mkdir(join(this._stateDir, 'agent-inbox', 'chats'), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(turn)}\n`, 'utf-8');
      logger.debug('[ChatTranscript#append] [idle → appended]', { mrRef, turnId: turn.id });
    } catch (cause) {
      const error = new Error(`[ChatTranscript#append] Failed to append turn for ${mrRef}`, {
        cause,
      });
      logger.error('[ChatTranscript#append] [appending → failed]', { error });
      throw error;
    }
  }
}
