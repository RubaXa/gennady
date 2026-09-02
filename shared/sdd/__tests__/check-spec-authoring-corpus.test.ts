// @file: Corpus contract for adaptive spec-authoring validation and trivial auto-fix.
// @consumers: check, sdd-check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as checkModule from '../check.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'spec-authoring');

function fixture(relative: string): string {
  return readFileSync(join(FIXTURES, relative), 'utf8');
}

function codes(relative: string): string[] {
  return checkModule
    .checkSpecAuthoringDraft(relative, fixture(relative))
    .map((finding) => finding.code);
}

describe('spec authoring corpus — real documents and observed distortions', () => {
  it('accepts the real completed Fibonacci scope without structural false positives', () => {
    assert.deepStrictEqual(codes('valid/fibonacci.scope.spec.md'), []);
  });

  it('accepts the real completed nth module without structural false positives', () => {
    assert.deepStrictEqual(codes('valid/nth.module.spec.md'), []);
  });

  it('detects a required section heading at the wrong level', () => {
    assert.ok(codes('distorted/wrong-heading.spec.md').includes('SDD_AUTHORING_HEADING_LEVEL'));
  });

  it('detects prose where the skeleton requires an Out-of-Scope list', () => {
    assert.ok(codes('distorted/prose-list.spec.md').includes('SDD_AUTHORING_LIST_REQUIRED'));
  });

  it('detects requirement entries whose headings lost REQ IDs', () => {
    assert.ok(
      codes('distorted/missing-requirement-ids.spec.md').includes('SDD_REQUIREMENT_ID_MISSING')
    );
  });

  it('detects skeleton guidance left in an otherwise authored document', () => {
    assert.ok(codes('distorted/leftover-guidance.spec.md').includes('SDD_AUTHORING_PLACEHOLDER'));
  });

  it('detects the independently captured P7 skeleton hint after authored prose', () => {
    assert.ok(
      codes('distorted/p7-leftover-skeleton-guidance.spec.md').includes('SDD_AUTHORING_PLACEHOLDER')
    );
  });

  it('auto-fixes only trivial whitespace and preserves the authored content', () => {
    const fixer = (
      checkModule as typeof checkModule & {
        autoFixSpecAuthoringDraft?: (content: string) => { content: string; fixes: string[] };
      }
    ).autoFixSpecAuthoringDraft;
    assert.ok(fixer, 'autoFixSpecAuthoringDraft must be implemented by P8.2');
    const fixed = fixer(fixture('autofix/trivial-whitespace.input.spec.md'));
    assert.deepStrictEqual(fixed.content, fixture('autofix/trivial-whitespace.expected.spec.md'));
    assert.ok(fixed.fixes.length > 0);
  });
});
