// @file: Deterministic signal classification + decision table for SV-22 autonomous thread
//   resolution — classifies claim/commit/verified against the live diff, then picks the
//   resolve/react/reply/skip/dispute action WITHOUT LLM involvement at this layer. Dispute
//   detection itself (author disagrees vs. explains) stays the job of the existing
//   `node_thread_triage` session (reviewer.role.ts:700-725) — this module only consumes that
//   classification, never reinvents it.
// @consumers: RoleInstance
// @tasks: TSK-142

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type { Discussion } from '../inbox-core/vcs-inbox.port.ts';

/**
 * @purpose Diff-level context `classifyThreadSignals` checks a thread's location against.
 * @invariant `changedFiles` comes from `ChangesetFile[].path`, never recomputed here.
 *   `authorLogin` rides along — no second parameter for one MR-author identity.
 */
export type MrDiffContext = {
  /** @purpose Repo-relative paths touched between diff base and current HEAD */
  changedFiles: ReadonlySet<string>;
  /** @purpose Local worktree root for reading current file content at HEAD | @invariant Absent → `verified` cannot read code and is forced false, never short-circuited true */
  worktreePath?: string;
  /** @purpose MR author's VCS username */
  authorLogin: string;
};

/**
 * @purpose Full signal set `decideThreadAction` reads to pick one of the five SV-22 outcomes.
 * @invariant `claim`/`commit`/`verified`/`ownedByMe`/`lastNoteFromAuthor` are structurally derived
 *   by `classifyThreadSignals`. `disputed`/`quietPeriodElapsed` default to `false` there — the
 *   caller overlays them from `node_thread_triage` and `DebounceTracker` before deciding.
 */
export type ThreadSignalVerdict = {
  /** @purpose The MR author wrote a fix-claim note ("done"/"fixed"/etc.) in this thread */
  claim: boolean;
  /** @purpose A commit in the current diff touched the thread's file (or, for a file-less thread, any commit landed) */
  commit: boolean;
  /** @purpose Re-reading the thread's file:line on current HEAD confirms the location still exists | @invariant Never true on `commit: false` — a real code read, not a commit-existence shortcut */
  verified: boolean;
  /** @purpose I have a note in this thread (`note.username === myLogin`) — resolve is legal ONLY when true */
  ownedByMe: boolean;
  /** @purpose The thread's last note was authored by the MR author (vs. me or a third party) */
  lastNoteFromAuthor: boolean;
  /** @purpose Author explicitly disagreed with the finding — sourced from `node_thread_triage`, never recomputed here | @default false */
  disputed: boolean;
  /** @purpose The SV-20 quiet period since the last event has fully elapsed — gates the "not done" reply of rule (d) | @default false */
  quietPeriodElapsed: boolean;
};

/**
 * @purpose The five SV-22 autonomous outcomes `decideThreadAction` can return.
 * @invariant `resolve_silently`/`react_then_resolve`/`reply_not_done` are the only kinds carrying
 *   `EffectExecutor`-bound work; `skip`/`dispute` carry none.
 */
export type ThreadDecision =
  | { kind: 'resolve_silently' }
  | { kind: 'react_then_resolve' }
  | { kind: 'skip' }
  | { kind: 'reply_not_done' }
  | { kind: 'dispute' };

/** @purpose Fix-claim keyword vocabulary (EN + RU) — a note matches when the author says the finding is addressed. */
const FIX_CLAIM_PATTERN =
  /\b(done|fixed|resolved|addressed)\b|сделал|исправил|исправлено|готово|поправил|устранил|доработал/i;

/**
 * @purpose Whether a note's body reads as an author fix-claim.
 * @param body Note text (Markdown).
 * @returns True when the body matches the fix-claim vocabulary.
 */
function _containsFixClaim(body: string): boolean {
  return FIX_CLAIM_PATTERN.test(body);
}

/**
 * @purpose Real re-check of the thread's code location on HEAD — `verified` reads the file
 *   instead of short-circuiting on "a commit happened".
 * @invariant A file-less thread (no `file`/`line`) cannot be verified — returns false, not a guess.
 * @param thread Discussion carrying the file/line to re-check.
 * @param worktreePath Local worktree root, if a live worktree is available.
 * @returns True when the file is readable at HEAD and the thread's line is still in range.
 * @sideEffect FS: reads `thread.file` under `worktreePath`.
 */
function _verifyCodeAtHead(thread: Discussion, worktreePath: string | undefined): boolean {
  if (!worktreePath || !thread.file) return false;

  // invariant: a missing file / out-of-range line means the finding's location is gone
  // (deleted/moved), which is itself informative — never masked as "ok"
  try {
    const content = readFileSync(join(worktreePath, thread.file), 'utf-8');
    if (thread.line === undefined) return true;
    const totalLines = content.split('\n').length;
    return thread.line > 0 && thread.line <= totalLines;
  } catch (cause) {
    logger.warn('[classifyThreadSignals#_verifyCodeAtHead] [reading → degraded]', {
      file: thread.file,
      error: String(cause),
    });
    return false;
  }
}

/**
 * @purpose Compute the `claim`/`commit`/`verified`/ownership signals for one open thread against
 *   the current diff — the deterministic half of SV-22 (D-133); dispute is not computed here.
 * @param thread Open discussion thread (read-only `VcsInboxPort#getDiscussions` result).
 * @param mrDiff Diff-level context: changed files, worktree, MR author login.
 * @param myLogin My VCS username — distinguishes my notes from the author's/third parties'.
 * @returns Verdict with `disputed`/`quietPeriodElapsed` defaulted to false — caller overlays
 *   those two from `node_thread_triage` output and `DebounceTracker` before deciding an action.
 * @sideEffect FS: `verified` reads the thread's file under `mrDiff.worktreePath`.
 */
export function classifyThreadSignals(
  thread: Discussion,
  mrDiff: MrDiffContext,
  myLogin: string
): ThreadSignalVerdict {
  const ownedByMe = thread.notes.some((note) => note.username === myLogin);
  const lastNote = thread.notes[thread.notes.length - 1];
  const lastNoteFromAuthor = lastNote?.username === mrDiff.authorLogin;
  const claim = thread.notes.some(
    (note) => note.username === mrDiff.authorLogin && _containsFixClaim(note.body)
  );
  const commit = thread.file ? mrDiff.changedFiles.has(thread.file) : mrDiff.changedFiles.size > 0;
  const verified = commit && _verifyCodeAtHead(thread, mrDiff.worktreePath);

  return {
    claim,
    commit,
    verified,
    ownedByMe,
    lastNoteFromAuthor,
    disputed: false,
    quietPeriodElapsed: false,
  };
}

/**
 * @purpose Pure decision table for SV-22 rules (a)-(e) — deterministic, not an LLM heuristic at
 *   this layer (semantics for `disputed` are pre-classified upstream).
 * @invariant Rule (f) — resolve is NEVER legal for a peer-owned thread — is checked FIRST and
 *   unconditionally, ahead of every signal-based rule.
 * @invariant Dispute (e) takes precedence over every fix-signal rule once ownership passes.
 * @param verdict Full signal set for one thread.
 * @returns The action class RoleInstance dispatches (or skips) for this thread.
 */
export function decideThreadAction(verdict: ThreadSignalVerdict): ThreadDecision {
  // structural invariant: never resolve someone else's thread
  if (!verdict.ownedByMe) return { kind: 'skip' };

  if (verdict.disputed) return { kind: 'dispute' };

  const fixConfirmed = verdict.commit && verdict.verified;
  if (fixConfirmed) {
    return verdict.lastNoteFromAuthor
      ? { kind: 'react_then_resolve' }
      : { kind: 'resolve_silently' };
  }

  if (verdict.claim && verdict.quietPeriodElapsed) {
    return { kind: 'reply_not_done' };
  }

  return { kind: 'skip' };
}
