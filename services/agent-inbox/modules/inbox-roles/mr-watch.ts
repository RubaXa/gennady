// @file: Per-MR event detection (new commits / new replies in my threads) + a persisted
//   per-MR quiet-period tracker — the auto-observation + debounce layer `RoleScheduler#tick`
//   gates a resumed instance's `step()` on (SV-19/20/21, agent-inbox spec §4.1.5).
// @consumers: RoleScheduler
// @tasks: TSK-141

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { Discussion } from '../inbox-core/vcs-inbox.port.ts';

/**
 * @purpose Classified event state for an MR that already has an active `RoleInstance`.
 * @invariant Both flags are independent — a tick can carry a commit, a reply, both, or neither.
 */
export type MrEventSignal = {
  /** @purpose Head moved since the last completed review (`_classifyHeadChanged`: 'fast_forward'/'rewritten') */
  hasNewCommit: boolean;
  /** @purpose A note from someone other than me landed in one of MY threads after `since` */
  hasMyThreadReply: boolean;
};

/**
 * @purpose Classify a new commit and/or a fresh reply in my threads since `since` for one tick.
 * @invariant "my thread" = a discussion where I have a note; "fresh reply" = a note by someone
 *   else, timestamped strictly after `since`.
 * @param discussions MR discussion threads (read-only `VcsInboxPort#getDiscussions` result).
 * @param headChanged `_classifyHeadChanged` classification.
 * @param myLogin My VCS username — distinguishes my own notes from replies.
 * @param since ISO timestamp — notes at or before this moment are not "new".
 * @returns Classified signal for this tick.
 */
export function detectMrEvents(
  discussions: Discussion[],
  headChanged: string | undefined,
  myLogin: string,
  since: string
): MrEventSignal {
  const hasNewCommit = headChanged === 'fast_forward' || headChanged === 'rewritten';
  const sinceMs = Date.parse(since);

  const hasMyThreadReply = discussions.some((discussion) => {
    const isMyThread = discussion.notes.some((note) => note.username === myLogin);
    if (!isMyThread) return false;
    return discussion.notes.some(
      (note) => note.username !== myLogin && Date.parse(note.createdAt) > sinceMs
    );
  });

  return { hasNewCommit, hasMyThreadReply };
}

/** @purpose On-disk shape of one MR's quiet-period marker. */
type DebounceMarker = {
  /** @purpose ISO timestamp of the last qualifying event (a reply) that (re)armed the window */
  lastEventAt: string;
};

/**
 * @purpose Per-MR quiet-period tracker (SV-20): a reply arms a quiet window; `shouldTriggerAnalysis`
 *   returns true only once it fully elapses since the last recorded event.
 * @invariant Persisted as a JSON marker under `reports/<mr>/` — per-MR, not global (D-127);
 *   survives a serve restart.
 * @invariant Commit-only ticks never call `recordEvent` — only a reply arms/re-arms the window.
 */
export class DebounceTracker {
  /** @purpose Root state directory (`StateStore.getStateDir()`) */
  protected _stateDir: string;
  /** @purpose Quiet period in ms before analysis is allowed */
  protected _quietMs: number;

  /**
   * @param stateDir `StateStore.getStateDir()` root.
   * @param [quietMs] Quiet period before analysis is allowed | @default 300000 (5 min), like `pollingInterval`.
   */
  constructor(stateDir: string, quietMs = 5 * 60_000) {
    this._stateDir = stateDir;
    this._quietMs = quietMs;
  }

  /**
   * @purpose Absolute path of this MR's marker file.
   * @param ref MR reference (`group/project!iid`).
   * @returns Absolute path under `reports/<mr>/`.
   */
  protected _markerPath(ref: string): string {
    return join(mrReportsDir(this._stateDir, ref), 'watch-debounce.json');
  }

  /**
   * @purpose Record a qualifying event now — (re)arms the quiet window from this moment.
   * @param ref MR reference (`group/project!iid`).
   * @param now ISO timestamp of the event.
   * @sideEffect FS: writes the marker file under `reports/<mr>/`, creating the dir if absent.
   */
  recordEvent(ref: string, now: string): void {
    try {
      const dir = mrReportsDir(this._stateDir, ref);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'watch-debounce.json'),
        JSON.stringify({ lastEventAt: now } satisfies DebounceMarker)
      );
    } catch (cause) {
      logger.warn('[DebounceTracker#recordEvent] [recording → degraded]', {
        ref,
        error: String(cause),
      });
    }
  }

  /**
   * @purpose Whether the quiet window has fully elapsed since the last recorded event.
   * @param ref MR reference (`group/project!iid`).
   * @param now ISO timestamp to evaluate against.
   * @returns True when ≥`quietMs` elapsed since the last event; false when none was recorded.
   */
  shouldTriggerAnalysis(ref: string, now: string): boolean {
    const path = this._markerPath(ref);
    if (!existsSync(path)) return false;
    try {
      const marker = JSON.parse(readFileSync(path, 'utf-8')) as DebounceMarker;
      return Date.parse(now) - Date.parse(marker.lastEventAt) >= this._quietMs;
    } catch (cause) {
      logger.warn('[DebounceTracker#shouldTriggerAnalysis] [reading → degraded]', {
        ref,
        error: String(cause),
      });
      return false;
    }
  }

  /**
   * @purpose Last recorded event timestamp — the `since` reference `detectMrEvents` compares
   *   fresh notes against, and the marker of a still-pending quiet window.
   * @param ref MR reference (`group/project!iid`).
   * @returns ISO timestamp of the last recorded event, or undefined when none is pending.
   */
  lastEventAt(ref: string): string | undefined {
    const path = this._markerPath(ref);
    if (!existsSync(path)) return undefined;
    try {
      return (JSON.parse(readFileSync(path, 'utf-8')) as DebounceMarker).lastEventAt;
    } catch {
      return undefined;
    }
  }

  /**
   * @purpose Consume a resolved quiet window — removes the marker so the next event starts fresh.
   * @param ref MR reference (`group/project!iid`).
   * @sideEffect FS: deletes the marker file, if present.
   */
  clear(ref: string): void {
    const path = this._markerPath(ref);
    try {
      if (existsSync(path)) rmSync(path);
    } catch (cause) {
      logger.warn('[DebounceTracker#clear] [clearing → degraded]', { ref, error: String(cause) });
    }
  }
}
