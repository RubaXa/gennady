// @file: Unit tests for the pure mechanical SDD checks.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket, isTicket } from '../check.ts';

const CLEAN = [
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [x] DONE',
  '<!--/SECTION:META-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '### Round 1 — 2026-06-21, initial',
  '#### P1',
  '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
  '- [x] `2026-06-21T10:00:00Z` DONE',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

function codes(content: string): string[] {
  return checkTicket('t.md', content).map((f) => f.code);
}

describe('isTicket', () => {
  it('recognizes a ticket by META + EXECUTION_LOG', () => {
    assert.strictEqual(isTicket(CLEAN), true);
    assert.strictEqual(isTicket('<!--SECTION:META-->\nx\n<!--/SECTION:META-->'), false);
  });
});

describe('checkTicket', () => {
  it('clean DONE ticket → no findings', () => {
    assert.deepStrictEqual(checkTicket('t.md', CLEAN), []);
  });

  it('flags a fabricated DONE — [x] line with an unreplaced placeholder', () => {
    const c = CLEAN.replace(
      '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
      '- [x] `2026-06-21T10:00:00Z` ver `<cmd>` → pass exit=0'
    );
    assert.ok(codes(c).includes('SDD_FABRICATED_DONE'));
  });

  it('flags an unbalanced anchor', () => {
    const c = CLEAN.replace('<!--/SECTION:META-->', '');
    assert.ok(codes(c).includes('SDD_ANCHOR_UNBALANCED'));
  });

  it('flags a missing EXECUTION_LOG section', () => {
    const c = ['<!--SECTION:META-->', '- **Task-ID:** cli-foo', '- **Status:** [ ] TODO', '<!--/SECTION:META-->'].join('\n');
    // not a ticket by isTicket, but checkTicket still reports the missing log
    assert.ok(codes(c).includes('SDD_MISSING_EXECUTION_LOG'));
  });

  it('flags DONE with an active blocker', () => {
    const c = CLEAN.replace('#### P1', '#### P1\n- 🛑 BLOCKED waiting on operator');
    assert.ok(codes(c).includes('SDD_DONE_WITH_ACTIVE_BLOCKER'));
  });

  it('does not flag DONE when the blocker was resolved later', () => {
    const c = CLEAN.replace('#### P1', '#### P1\n- 🛑 BLOCKED waiting\n- ✅ RESOLVED operator chose B');
    assert.ok(!codes(c).includes('SDD_DONE_WITH_ACTIVE_BLOCKER'));
  });

  it('warns on DONE with leftover placeholders', () => {
    const c = CLEAN.replace('- **Task-ID:** cli-foo', '- **Task-ID:** cli-foo\n- **Note:** <TBD>');
    assert.ok(codes(c).includes('SDD_DONE_WITH_PLACEHOLDERS'));
  });

  it('warns on missing Task-ID and unparseable status', () => {
    const c = ['<!--SECTION:META-->', '- **Purpose:** x', '<!--/SECTION:META-->', '<!--SECTION:EXECUTION_LOG-->', 'log', '<!--/SECTION:EXECUTION_LOG-->'].join('\n');
    const cs = codes(c);
    assert.ok(cs.includes('SDD_MISSING_TASK_ID'));
    assert.ok(cs.includes('SDD_STATUS_UNPARSEABLE'));
  });
});
