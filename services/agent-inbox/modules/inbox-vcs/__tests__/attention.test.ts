// @file: Unit tests for deriveAttention — 6 attention rows + fallback without detail tier.
// @consumers: node:test runner
// @tasks: TSK-158

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAttention,
  type AttentionState,
  type AttentionResult,
  type AttentionInput,
} from '../attention.ts';

function makeInput(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    myRole: 'reviewer',
    myLogin: 'me',
    lastReviewedHeadSha: null,
    headSha: 'abc123',
    threads: [],
    approvals: { n: 1, m: 2, approvedByMe: false },
    estimated: false,
    ...overrides,
  };
}

describe('deriveAttention — contract surface', () => {
  it('contract: vcs port surface and attention enum', () => {
    // contract: type-check gate — AttentionState has exactly 5 values; deriveAttention returns {state, estimated}
    // failure mode: estimated must be boolean, not a 6th AttentionState value

    const states: Set<AttentionState> = new Set(['⏳', '💬', '🔀', '✅', '😴']);
    assert.strictEqual(states.size, 5);

    const result: AttentionResult = { state: '😴', estimated: false };
    assert.strictEqual(typeof result.estimated, 'boolean');
    assert.ok(states.has(result.state));
  });
});

describe('deriveAttention — attention derivation covers all six rows', () => {
  it('row 1 — reviewer, head not reviewed → ⏳', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'old123',
      headSha: 'new456',
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '⏳', estimated: false });
  });

  it('row 2 — threads have responses after me → 💬', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [
        {
          resolved: false,
          author: 'other',
          hasResponseAfterMe: true,
          awaitingMyResponse: false,
        },
      ],
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '💬', estimated: false });
  });

  it('row 2 — my threads awaiting response → 💬', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [
        {
          resolved: false,
          author: 'other',
          hasResponseAfterMe: false,
          awaitingMyResponse: true,
        },
      ],
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '💬', estimated: false });
  });

  it('row 3 — author with unresolved reviewer threads → 💬', () => {
    const input = makeInput({
      myRole: 'author',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [
        {
          resolved: false,
          author: 'reviewer1',
          hasResponseAfterMe: false,
          awaitingMyResponse: false,
        },
      ],
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '💬', estimated: false });
  });

  it('row 4 — new commits after last review → 🔀', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'old456',
      headSha: 'new789',
      threads: [],
      approvals: { n: 1, m: 2, approvedByMe: true },
    });

    const result = deriveAttention(input);
    // ⏳ beats 🔀 because reviewer+sha mismatch matches row 1 first
    // for 🔀 we need a non-reviewer with sha change
    const inputForRerereview = makeInput({
      myRole: null,
      lastReviewedHeadSha: 'old456',
      headSha: 'new789',
      threads: [],
      approvals: { n: 1, m: 2, approvedByMe: true },
    });

    const resultRerereview = deriveAttention(inputForRerereview);
    assert.deepStrictEqual(resultRerereview, { state: '🔀', estimated: false });
  });

  it('row 5 — all clear, only my approval missing → ✅', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [],
      approvals: { n: 1, m: 2, approvedByMe: false },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '✅', estimated: false });
  });

  it('row 6 — nothing left to do → 😴', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [],
      approvals: { n: 2, m: 2, approvedByMe: true },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '😴', estimated: false });
  });

  it('resolved threads are excluded from active thread detection', () => {
    // contract: resolved threads do NOT trigger 💬 — only unresolved ones matter
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [
        {
          resolved: true,
          author: 'other',
          hasResponseAfterMe: true,
          awaitingMyResponse: false,
        },
      ],
      approvals: { n: 2, m: 2, approvedByMe: true },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '😴', estimated: false });
  });
});

describe('deriveAttention — fallback attention without detail tier', () => {
  it('fallback attention without detail tier is conservative and marked', () => {
    // contract: poll-only (estimated=true), sha differs from lastReviewed → ⏳ with estimated=true
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'old123',
      headSha: 'new456',
      estimated: true,
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '⏳', estimated: true });
  });

  it('fallback — never reviewed → ⏳ estimated', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: null,
      headSha: 'new456',
      estimated: true,
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '⏳', estimated: true });
  });

  it('fallback — sha unchanged and been reviewed → 😴 estimated', () => {
    const input = makeInput({
      myRole: 'reviewer',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      estimated: true,
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '😴', estimated: true });
  });
});

describe('deriveAttention — Round 2 blocker regression coverage', () => {
  it('T1: author with own unresolved thread → 😴 (not 💬)', () => {
    // contract: BLOCKER-1 fix — ROW_3 uses t.author !== myLogin, so author\'s own unresolved
    // thread does NOT trigger 💬. Author doesn\'t need to answer themselves.
    const input = makeInput({
      myRole: 'author',
      myLogin: 'alice',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [
        {
          resolved: false,
          author: 'alice',
          hasResponseAfterMe: false,
          awaitingMyResponse: false,
        },
      ],
      approvals: { n: 0, m: 1, approvedByMe: false },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '😴', estimated: false });
  });

  it('T2: author with clean MR → 😴 (not ✅)', () => {
    // contract: BLOCKER-2 fix — ROW_5 has myRole !== \'author\' guard (D-68).
    // Author never approves own MR, so clean author MR → 😴 not ✅.
    const input = makeInput({
      myRole: 'author',
      myLogin: 'alice',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [],
      approvals: { n: 0, m: 1, approvedByMe: false },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '😴', estimated: false });
  });

  it('T3: reviewer already reviewed current head → not ⏳', () => {
    // contract: ROW_1 requires headSha !== lastReviewedHeadSha. When they match,
    // the reviewer has already reviewed this head — no ⏳ needed.
    const input = makeInput({
      myRole: 'reviewer',
      myLogin: 'me',
      lastReviewedHeadSha: 'abc123',
      headSha: 'abc123',
      threads: [],
      approvals: { n: 0, m: 2, approvedByMe: false },
    });

    const result = deriveAttention(input);
    // ROW_1 skipped (sha match), ROW_5 triggered → ✅
    assert.notDeepStrictEqual(result.state, '⏳');
    assert.deepStrictEqual(result, { state: '✅', estimated: false });
  });

  it('T4: sha change for non-reviewer → 🔀 (re-review needed)', () => {
    // contract: ROW_4 — lastReviewedHeadSha !== null && !== headSha → 🔀.
    // For reviewers, ROW_1 (⏳) beats ROW_4. 🔀 triggers for non-reviewer roles
    // when new commits arrive after a previous review.
    const input = makeInput({
      myRole: null,
      myLogin: 'me',
      lastReviewedHeadSha: 'old456',
      headSha: 'new789',
      threads: [],
      approvals: { n: 0, m: 2, approvedByMe: false },
    });

    const result = deriveAttention(input);
    assert.deepStrictEqual(result, { state: '🔀', estimated: false });
  });
});
