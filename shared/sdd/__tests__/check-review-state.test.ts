// @file: Unit tests for checkReviewState — lifecycle tracking (master vs review-state, malformed/stuck).
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkReviewState } from '../check.ts';

const manifest = (body: string): string =>
  `<!--SECTION:CHANGE_MANIFEST-->\n## ⟢ Change Manifest\n\n${body}\n<!--/SECTION:CHANGE_MANIFEST-->\n\n## 1. Vision\nx`;

const codesOf = (c: string): string[] => checkReviewState('s.spec.md', c).map((f) => f.code);

describe('checkReviewState', () => {
  it('master (no manifest, no marks) → no findings', () => {
    assert.deepStrictEqual(checkReviewState('s.spec.md', '## 1. Vision\nclean spec'), []);
  });

  it('valid review-state (manifest + ТИП) → one STUCK warning, no error', () => {
    const fs = checkReviewState('s.spec.md', manifest('ТИП ИЗМЕНЕНИЯ: refine · add X'));
    assert.deepStrictEqual(
      fs.map((f) => f.code),
      ['SDD_REVIEW_STATE_STUCK']
    );
    assert.strictEqual(fs[0]?.severity, 'warn');
  });

  it('✚/~ marks without a manifest → INCONSISTENT error', () => {
    const codes = codesOf('## 1. Vision\n✚ FOO-REQ-3 — new requirement\n~ Bar — tightened');
    assert.ok(codes.includes('SDD_REVIEW_INCONSISTENT'));
  });

  it('manifest missing ТИП ИЗМЕНЕНИЯ → INCONSISTENT error', () => {
    const codes = codesOf(manifest('СВЯЗЬ С МИРОМ: something'));
    assert.ok(codes.includes('SDD_REVIEW_INCONSISTENT'));
  });

  it('does not false-positive on ~ (ambiguous in markdown — only ✚ is a detection mark)', () => {
    assert.deepStrictEqual(checkReviewState('s.spec.md', '## 1. Vision\ncoverage ~80% target'), []);
    // `~ path` at line start (e.g. a file tree / diff display) must NOT be read as a change-mark.
    assert.deepStrictEqual(
      checkReviewState('s.spec.md', '```\n~ ai/foo/bar.ts\n~ ai/foo/baz.ts\n```'),
      []
    );
  });
});
