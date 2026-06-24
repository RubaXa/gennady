// @file: Pure classifier of an MR's stage from its discussion notes + my identity.
// @consumers: inbox.cmd
// @tasks: N/A

import type { VcsActionableRole } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose Actionable stage of an MR derived from discussion state. */
export type MrStage = 'review_needed' | 'reply_needed' | 'awaiting_reply' | 'idle';

/** @purpose Minimal note shape we read from GitLab discussions. */
export type RawNote = {
  /** @purpose Note author */
  author?: { username?: string } | null;
  /** @purpose System-generated note (status change, etc.) — ignored for stage */
  system?: boolean;
  /** @purpose Creation timestamp */
  created_at?: string;
  /** @purpose Last-update timestamp */
  updated_at?: string;
  /** @purpose Note text */
  body?: string;
};

type RawDiscussion = { notes?: RawNote[] | null };

/** @purpose One note the user still needs to respond to. */
export type OpenNote = {
  /** @purpose Author username */
  author: string;
  /** @purpose Timestamp of the note */
  at: string;
  /** @purpose Note text */
  body: string;
};

/** @purpose Assembled context for acting on one MR. */
export type WorkPacket = {
  /** @purpose Computed stage */
  stage: MrStage;
  /** @purpose My role on the MR */
  role: VcsActionableRole | null;
  /** @purpose Whether this is a first review (no notes from me yet) */
  needsReview: boolean;
  /** @purpose Notes by others awaiting my response */
  openNotes: OpenNote[];
};

/**
 * @purpose Flatten GitLab discussions (unknown[]) into a flat list of notes.
 * @param discussions Raw discussions array from the VCS client.
 * @returns Flat list of notes.
 * @consumer classifyMrStage
 */
export function flattenNotes(discussions: unknown[]): RawNote[] {
  return (discussions as RawDiscussion[]).flatMap((d) => d?.notes ?? []);
}

/**
 * @purpose Decide what the MR needs from me, comparing my activity to others'.
 * @param notes Flattened discussion notes.
 * @param myLogin My GitLab username.
 * @param role My role on the MR.
 * @returns Stage: review_needed, reply_needed, awaiting_reply, or idle.
 * @consumer inbox.cmd
 */
export function classifyMrStage(
  notes: RawNote[],
  myLogin: string,
  role: VcsActionableRole | null
): MrStage {
  const ts = (n: RawNote) => Date.parse(n.updated_at ?? n.created_at ?? '') || 0;
  const real = notes.filter((n) => !n.system);
  const mine = real.filter((n) => n.author?.username === myLogin);
  const others = real.filter((n) => n.author?.username && n.author.username !== myLogin);

  const myLast = mine.length > 0 ? Math.max(...mine.map(ts)) : null;
  const otherLast = others.length > 0 ? Math.max(...others.map(ts)) : null;

  // A reviewer who has not said anything yet still owes a first review.
  if (role === 'reviewer' && myLast === null) return 'review_needed';
  // Someone wrote after me (or I never replied) → the ball is in my court.
  if (otherLast !== null && (myLast === null || otherLast > myLast)) return 'reply_needed';
  // I spoke last → waiting on others.
  if (myLast !== null) return 'awaiting_reply';
  return 'idle';
}

/**
 * @purpose Assemble the context for acting on one MR: stage plus the notes from
 *   others I still have to answer (those after my last note, or all if I never spoke).
 * @param notes Flattened discussion notes.
 * @param myLogin My GitLab username.
 * @param role My role on the MR.
 * @returns Work packet with stage, role, review flag, and open notes.
 * @consumer inbox.cmd
 */
export function buildWorkPacket(
  notes: RawNote[],
  myLogin: string,
  role: VcsActionableRole | null
): WorkPacket {
  const ts = (n: RawNote) => Date.parse(n.updated_at ?? n.created_at ?? '') || 0;
  const real = notes.filter((n) => !n.system);
  const mine = real.filter((n) => n.author?.username === myLogin);
  const myLast = mine.length > 0 ? Math.max(...mine.map(ts)) : null;

  const openNotes: OpenNote[] = real
    .filter((n) => n.author?.username && n.author.username !== myLogin)
    .filter((n) => myLast === null || ts(n) > myLast)
    .map((n) => ({
      author: n.author?.username ?? '',
      at: n.updated_at ?? n.created_at ?? '',
      body: n.body ?? '',
    }));

  const stage = classifyMrStage(notes, myLogin, role);
  return { stage, role, needsReview: stage === 'review_needed', openNotes };
}
