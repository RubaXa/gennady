// @file: Unit tests for classifyMrStage / flattenNotes.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMrStage, flattenNotes, buildWorkPacket } from './classify-mr-stage.logic.ts';

const note = (login: string, at: string, system = false, body = '') => ({
  author: { username: login },
  system,
  updated_at: at,
  body,
});

const ME = 'me';

describe('flattenNotes', () => {
  it('flattens notes across discussions and tolerates missing fields', () => {
    const flat = flattenNotes([{ notes: [note('me', '2026-06-01')] }, {}, { notes: null }]);
    assert.strictEqual(flat.length, 1);
  });
});

describe('classifyMrStage', () => {
  it('reviewer with no notes from me → review_needed', () => {
    const notes = [note('alice', '2026-06-01')];
    assert.strictEqual(classifyMrStage(notes, ME, 'reviewer'), 'review_needed');
  });

  it('someone replied after my last note → reply_needed', () => {
    const notes = [note('me', '2026-06-01'), note('alice', '2026-06-02')];
    assert.strictEqual(classifyMrStage(notes, ME, 'reviewer'), 'reply_needed');
  });

  it('mentioned with an unanswered note from others → reply_needed', () => {
    const notes = [note('alice', '2026-06-02')];
    assert.strictEqual(classifyMrStage(notes, ME, 'mentioned'), 'reply_needed');
  });

  it('I spoke last → awaiting_reply', () => {
    const notes = [note('alice', '2026-06-01'), note('me', '2026-06-03')];
    assert.strictEqual(classifyMrStage(notes, ME, 'reviewer'), 'awaiting_reply');
  });

  it('author MR with no discussion → idle', () => {
    assert.strictEqual(classifyMrStage([], ME, 'author'), 'idle');
  });

  it('ignores system notes', () => {
    const notes = [note('alice', '2026-06-05', true)];
    // only a system note from others → no real activity → reviewer still owes review
    assert.strictEqual(classifyMrStage(notes, ME, 'reviewer'), 'review_needed');
  });
});

describe('buildWorkPacket', () => {
  it('collects others notes after my last as open notes', () => {
    const notes = [
      note('me', '2026-06-01', false, 'looks ok'),
      note('alice', '2026-06-02', false, 'what about X?'),
    ];
    const p = buildWorkPacket(notes, ME, 'reviewer');
    assert.strictEqual(p.stage, 'reply_needed');
    assert.strictEqual(p.needsReview, false);
    assert.strictEqual(p.openNotes.length, 1);
    assert.strictEqual(p.openNotes[0].author, 'alice');
    assert.strictEqual(p.openNotes[0].body, 'what about X?');
  });

  it('first review: needsReview true, all others are open', () => {
    const notes = [note('alice', '2026-06-02', false, 'q')];
    const p = buildWorkPacket(notes, ME, 'reviewer');
    assert.strictEqual(p.needsReview, true);
    assert.strictEqual(p.openNotes.length, 1);
  });

  it('awaiting: no open notes when I spoke last', () => {
    const notes = [note('alice', '2026-06-01'), note('me', '2026-06-03')];
    const p = buildWorkPacket(notes, ME, 'reviewer');
    assert.strictEqual(p.stage, 'awaiting_reply');
    assert.strictEqual(p.openNotes.length, 0);
  });
});
