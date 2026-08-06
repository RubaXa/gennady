// @file: AttentionState — 5-value attention axis + deriveAttention pure function (6 rows + fallback).
// @consumers: SyncService, inbox-api, inbox-dashboard
// @tasks: TSK-158

/** @purpose Closed set of 5 attention states shown on the MR card. */
export type AttentionState = '⏳' | '💬' | '🔀' | '✅' | '😴';

/** @purpose Result of attention derivation — state plus estimated flag for poll-only computation. */
export type AttentionResult = {
  /** @purpose Computed attention state */
  state: AttentionState;
  /** @purpose True when attention derived from poll-only fields without detail tier */
  estimated: boolean;
};

/** @purpose Minimal thread info needed for attention derivation — consumed by deriveAttention. */
export type AttentionThread = {
  /** @purpose Whether the thread is resolved */
  resolved: boolean;
  /** @purpose Thread author username */
  author: string;
  /** @purpose Whether someone replied after my last note in this thread */
  hasResponseAfterMe: boolean;
  /** @purpose Whether this thread is awaiting my response */
  awaitingMyResponse: boolean;
};

/** @purpose Approval snapshot for attention derivation. */
export type AttentionApprovals = {
  /** @purpose Total approval count (n out of m required) */
  n: number;
  /** @purpose Required approval count */
  m: number;
  /** @purpose Whether I have approved this MR */
  approvedByMe: boolean;
};

/** @purpose Input for deriveAttention — all fields needed to compute attention deterministically. */
export type AttentionInput = {
  /** @purpose My role relative to this MR | @invariant author > reviewer > mentioned priority */
  myRole: 'author' | 'reviewer' | 'mentioned' | null;
  /** @purpose My VCS username for author comparison in row 3 (thread author != me) */
  myLogin: string;
  /** @purpose Last head SHA I reviewed (null = never reviewed) */
  lastReviewedHeadSha: string | null;
  /** @purpose Current head commit SHA */
  headSha: string;
  /** @purpose Discussion threads for attention computation */
  threads: AttentionThread[];
  /** @purpose Approval state snapshot */
  approvals: AttentionApprovals;
  /** @purpose Whether this is a poll-only (estimated) computation */
  estimated: boolean;
};

/**
 * @purpose Derive attention state deterministically from MR state — 6 rows + fallback for poll-only.
 * @invariant Row evaluation order: ⏳ > 💬 > 🔀 > ✅ > 😴 — first match wins.
 * @invariant Fallback (poll-only, estimated=true): sha changed or no review → ⏳; else → 😴.
 * @param input All fields needed to compute attention deterministically.
 * @returns Computed attention state with estimated flag.
 */
export function deriveAttention(input: AttentionInput): AttentionResult {
  const { myRole, myLogin, lastReviewedHeadSha, headSha, threads, approvals, estimated } = input;

  // #region START_APPLY_FALLBACK — poll-only: conservative estimate when no detail-tier data
  if (estimated) {
    if (headSha !== lastReviewedHeadSha || lastReviewedHeadSha === null) {
      return { state: '⏳', estimated: true };
    }
    return { state: '😴', estimated: true };
  }
  // #endregion END_APPLY_FALLBACK

  // #region START_ATTENTION_ROW_1 — reviewer, current head not reviewed → ⏳
  if (myRole === 'reviewer' && lastReviewedHeadSha !== headSha) {
    return { state: '⏳', estimated: false };
  }
  // #endregion END_ATTENTION_ROW_1

  // #region START_ATTENTION_ROW_2 — threads have responses after me or my threads without answer → 💬
  const hasActiveThread = threads.some(
    (t) => !t.resolved && (t.hasResponseAfterMe || t.awaitingMyResponse)
  );
  if (hasActiveThread) {
    return { state: '💬', estimated: false };
  }
  // #endregion END_ATTENTION_ROW_2

  // #region START_ATTENTION_ROW_3 — author with unresolved threads from reviewers (thread author != me) → 💬
  if (myRole === 'author') {
    const hasUnresolvedReviewerThreads = threads.some((t) => !t.resolved && t.author !== myLogin);
    if (hasUnresolvedReviewerThreads) {
      return { state: '💬', estimated: false };
    }
  }
  // #endregion END_ATTENTION_ROW_3

  // #region START_ATTENTION_ROW_4 — new commits after my last review → 🔀
  if (lastReviewedHeadSha !== null && lastReviewedHeadSha !== headSha) {
    return { state: '🔀', estimated: false };
  }
  // #endregion END_ATTENTION_ROW_4

  // #region START_ATTENTION_ROW_5 — all clear, only my approval missing (reviewer only; D-68: author never approves own MR) → ✅
  if (myRole !== 'author' && !approvals.approvedByMe) {
    return { state: '✅', estimated: false };
  }
  // #endregion END_ATTENTION_ROW_5

  // row 6 — nothing left to do → 😴
  return { state: '😴', estimated: false };
}
