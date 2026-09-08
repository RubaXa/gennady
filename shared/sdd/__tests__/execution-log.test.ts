// @file: Unit tests for the canonical Execution Log token vocabulary (B2-03).
// @consumers: execution-log
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKEN_VOCABULARY,
  TOKEN_VOCABULARY_TOKENS,
  isVocabularyToken,
  formatTokenVocabulary,
} from '../execution-log.ts';

describe('TOKEN_VOCABULARY', () => {
  it('is a closed set with no duplicate tokens', () => {
    assert.strictEqual(TOKEN_VOCABULARY_TOKENS.length, new Set(TOKEN_VOCABULARY_TOKENS).size);
  });

  it('includes every token that drifted out of the collected table (case #23): ver, yagni, env-fix, correction', () => {
    for (const token of ['ver', 'yagni', 'env-fix', 'correction']) {
      assert.ok(TOKEN_VOCABULARY_TOKENS.includes(token), `vocabulary is missing "${token}"`);
    }
  });

  it('includes "fix" — the board-named token backing 34 live corpus event lines (V-BATCH-04, B2-03)', () => {
    assert.ok(TOKEN_VOCABULARY_TOKENS.includes('fix'), 'vocabulary is missing "fix"');
  });

  it('still carries the original nine tokens (intro/decision/tried/discovery/insight/verified/SDD_PHASE_RECEIPT/BLOCKED/DONE)', () => {
    for (const token of [
      'intro',
      'decision',
      'tried',
      'discovery',
      'insight',
      'verified',
      'SDD_PHASE_RECEIPT',
      'BLOCKED',
      'DONE',
    ]) {
      assert.ok(TOKEN_VOCABULARY_TOKENS.includes(token), `vocabulary is missing "${token}"`);
    }
  });

  it('no grammar re-wraps itself in backticks (formatTokenVocabulary wraps each entry exactly once)', () => {
    for (const entry of TOKEN_VOCABULARY) {
      assert.doesNotMatch(
        entry.grammar,
        /`/,
        `"${entry.token}" grammar must not contain backticks`
      );
    }
  });
});

describe('isVocabularyToken', () => {
  it('accepts every canonical token', () => {
    for (const token of TOKEN_VOCABULARY_TOKENS) assert.strictEqual(isVocabularyToken(token), true);
  });

  it('accepts "correction:" — the live-corpus form with a trailing colon (issue #23)', () => {
    assert.strictEqual(isVocabularyToken('correction:'), true);
  });

  it('rejects an unknown first word', () => {
    assert.strictEqual(isVocabularyToken('padding'), false);
  });

  it('rejects other tokens with a trailing colon — only "correction:" is special-cased', () => {
    assert.strictEqual(isVocabularyToken('intro:'), false);
    assert.strictEqual(isVocabularyToken('ver:'), false);
  });

  it('is case-sensitive (DONE is not done)', () => {
    assert.strictEqual(isVocabularyToken('done'), false);
  });
});

describe('formatTokenVocabulary', () => {
  it('renders one middle-dot-joined line with each grammar backtick-wrapped exactly once', () => {
    const line = formatTokenVocabulary();
    const parts = line.split(' · ');
    assert.strictEqual(parts.length, TOKEN_VOCABULARY.length);
    for (const [i, part] of parts.entries()) {
      assert.strictEqual(part, `\`${TOKEN_VOCABULARY[i]!.grammar}\``);
    }
  });

  it('is deterministic across calls', () => {
    assert.strictEqual(formatTokenVocabulary(), formatTokenVocabulary());
  });
});
