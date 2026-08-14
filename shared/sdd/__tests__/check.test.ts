// @file: Unit tests for the pure mechanical SDD checks.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket, isTicket, scanBlockerTrail } from '../check.ts';

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

  it('flags a fabricated DONE — real [x] checkbox with a placeholder outside backticks', () => {
    const c = CLEAN.replace(
      '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
      '- [x] finished <task-name> outside backticks'
    );
    assert.ok(codes(c).includes('SDD_FABRICATED_DONE'));
  });

  it('does NOT flag the TASK_SKELETON Execution Log hint — its `[x]` and placeholder are both inline code', () => {
    const c = CLEAN.replace(
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--SECTION:EXECUTION_LOG-->\n' +
        '*(A `[x]` line with an unreplaced `<…>` placeholder is a fabricated DONE — forbidden.)*'
    );
    assert.ok(!codes(c).includes('SDD_FABRICATED_DONE'));
  });

  it('flags an unbalanced anchor', () => {
    const c = CLEAN.replace('<!--/SECTION:META-->', '');
    assert.ok(codes(c).includes('SDD_ANCHOR_UNBALANCED'));
  });

  it('flags a missing EXECUTION_LOG section', () => {
    const c = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-foo',
      '- **Status:** [ ] TODO',
      '<!--/SECTION:META-->',
    ].join('\n');
    // not a ticket by isTicket, but checkTicket still reports the missing log
    assert.ok(codes(c).includes('SDD_MISSING_EXECUTION_LOG'));
  });

  it('flags DONE with an active blocker', () => {
    const c = CLEAN.replace('#### P1', '#### P1\n- 🛑 BLOCKED waiting on operator');
    assert.ok(codes(c).includes('SDD_DONE_WITH_ACTIVE_BLOCKER'));
  });

  it('does not flag DONE when the blocker was resolved later', () => {
    const c = CLEAN.replace(
      '#### P1',
      '#### P1\n- 🛑 BLOCKED waiting\n- ✅ RESOLVED operator chose B'
    );
    assert.ok(!codes(c).includes('SDD_DONE_WITH_ACTIVE_BLOCKER'));
  });

  it('warns (not errors) on an open blocker while Status is not DONE', () => {
    const c = CLEAN.replace('- **Status:** [x] DONE', '- **Status:** [~] IN_PROGRESS').replace(
      '#### P1',
      '#### P1\n- 🛑 BLOCKED waiting on operator'
    );
    const findings = checkTicket('t.md', c);
    const blocker = findings.find((f) => f.code === 'SDD_BLOCKER_OPEN');
    assert.ok(blocker, 'expected an SDD_BLOCKER_OPEN finding');
    assert.strictEqual(blocker?.severity, 'warn');
    assert.ok(!codes(c).includes('SDD_DONE_WITH_ACTIVE_BLOCKER'));
  });

  it('does not warn when a non-DONE ticket has no open blocker', () => {
    const c = CLEAN.replace('- **Status:** [x] DONE', '- **Status:** [~] IN_PROGRESS');
    assert.ok(!codes(c).includes('SDD_BLOCKER_OPEN'));
  });

  it('warns on DONE with leftover placeholders', () => {
    const c = CLEAN.replace('- **Task-ID:** cli-foo', '- **Task-ID:** cli-foo\n- **Note:** <TBD>');
    assert.ok(codes(c).includes('SDD_DONE_WITH_PLACEHOLDERS'));
  });

  it('warns on missing Task-ID and unparseable status', () => {
    const c = [
      '<!--SECTION:META-->',
      '- **Purpose:** x',
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      'log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    const cs = codes(c);
    assert.ok(cs.includes('SDD_MISSING_TASK_ID'));
    assert.ok(cs.includes('SDD_STATUS_UNPARSEABLE'));
  });
});

describe('scanBlockerTrail', () => {
  it('no blockers → empty', () => {
    assert.deepStrictEqual(scanBlockerTrail('#### P1\n- did the thing'), []);
  });

  it('one active blocker → its line text', () => {
    const log = '#### P1\n- 🛑 BLOCKED waiting on operator';
    assert.deepStrictEqual(scanBlockerTrail(log), ['- 🛑 BLOCKED waiting on operator']);
  });

  it('a resolved blocker leaves no active entries', () => {
    const log = '#### P1\n- 🛑 BLOCKED waiting\n- ✅ RESOLVED operator chose B';
    assert.deepStrictEqual(scanBlockerTrail(log), []);
  });

  it('FIFO pairing: two blockers, one resolved → the older stays active', () => {
    const log = [
      '- 🛑 BLOCKED first issue',
      '- 🛑 BLOCKED second issue',
      '- ✅ RESOLVED fixed first',
    ].join('\n');
    assert.deepStrictEqual(scanBlockerTrail(log), ['- 🛑 BLOCKED second issue']);
  });
});
