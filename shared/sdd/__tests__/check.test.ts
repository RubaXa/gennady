// @file: Unit tests for the pure mechanical SDD checks.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket, isTicket, scanBlockerTrail, parsePhaseHandoffs } from '../check.ts';

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

  it('does NOT flag a real type signature quoted in backticks (`Promise<TodoStore>`) on a checked line', () => {
    const c = CLEAN.replace(
      '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
      '- [x] `2026-06-21T10:00:00Z` returns `Promise<TodoStore>` → pass exit=0'
    );
    assert.ok(!codes(c).includes('SDD_FABRICATED_DONE'));
  });

  it('still flags a bare unbackticked placeholder (`<cmd>`) on a checked line', () => {
    const c = CLEAN.replace(
      '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
      '- [x] `2026-06-21T10:00:00Z` ver <cmd> → pass exit=0'
    );
    assert.ok(codes(c).includes('SDD_FABRICATED_DONE'));
  });

  it('still flags a whole-span backticked placeholder (`` `<ts>` ``) on a checked line', () => {
    const c = CLEAN.replace(
      '- [x] `2026-06-21T10:00:00Z` ver `npm run check` → pass exit=0',
      '- [x] `<ts>` ver `npm run check` → pass exit=0'
    );
    assert.ok(codes(c).includes('SDD_FABRICATED_DONE'));
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

  it('does NOT warn on DONE when the only angle brackets are a backticked type signature', () => {
    const c = CLEAN.replace(
      '- **Task-ID:** cli-foo',
      '- **Task-ID:** cli-foo\n- **Returns:** `Promise<TodoStore>`'
    );
    assert.ok(!codes(c).includes('SDD_DONE_WITH_PLACEHOLDERS'));
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

  it('pairs per phase block, not globally FIFO: a later phase resolution never closes an older, unrelated phase blocker', () => {
    // Defect repro: P1 opens a blocker; P3 opens its OWN blocker; P3's own resolution (logged in
    // its re-run block) must close P3's blocker, not P1's older, unrelated one. The old global-FIFO
    // scan shifted the OLDEST push regardless of phase, so P1's blocker read as resolved and P3's
    // own (the one actually fixed) stayed active — backwards.
    const log = [
      '#### P1',
      '- 🛑 BLOCKED P1 issue',
      '#### P3',
      '- 🛑 BLOCKED P3 issue',
      '#### P3 — re-run: fix',
      '- ✅ RESOLVED P3 fixed',
    ].join('\n');
    assert.deepStrictEqual(scanBlockerTrail(log), ['- 🛑 BLOCKED P1 issue']);
  });

  it('a re-run block of the SAME phase shares its pool with the original block (P5/P3/P7 live-ticket shape)', () => {
    const log = [
      '#### P5',
      '- 🛑 BLOCKED P5 issue',
      '#### P5 — re-run: fix F-x',
      '- [x] `<ts>` ✅ RESOLVED: P5 issue fixed',
    ].join('\n');
    assert.deepStrictEqual(scanBlockerTrail(log), []);
  });

  it('a bare mention of the word BLOCKED (no 🛑 marker) is never counted as a blocker', () => {
    // Defect repro: a discovery/annotation line ABOUT a blocker (no 🛑 emoji) used to match the
    // old `/🛑|BLOCKED/` OR-regex on the bare word alone.
    const log = [
      '#### P2',
      '- [x] `<ts>` discovery second BLOCKED (00:21) was an unrelated lint issue, already fixed',
    ].join('\n');
    assert.deepStrictEqual(scanBlockerTrail(log), []);
  });

  it('a bare mention of the word RESOLVED (no ✅ marker) never closes a real blocker', () => {
    const log = [
      '#### P1',
      '- 🛑 BLOCKED real issue',
      '#### P1 — re-run: fix',
      '- [x] `<ts>` env-fix note ← the issue above is not actually RESOLVED yet, still investigating',
    ].join('\n');
    assert.deepStrictEqual(scanBlockerTrail(log), ['- 🛑 BLOCKED real issue']);
  });
});

describe('parsePhaseHandoffs', () => {
  it('a real Handoff line is captured verbatim, keyed by phase id', () => {
    const log = [
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` DONE',
      '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
    ].join('\n');
    assert.deepStrictEqual(parsePhaseHandoffs(log), {
      P1: '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
    });
  });

  it('skips the Round-1 skeleton placeholder (artifacts/decisions/open all `[...]`) and picks up the later real close', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [ ] `<ts>` DONE',
      '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
      '### Round 2 — 2026-06-22, execute',
      '#### P1',
      '- [x] `2026-06-22T10:00:00Z` DONE',
      '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
    ].join('\n');
    assert.deepStrictEqual(parsePhaseHandoffs(log), {
      P1: '**Handoff →** artifacts: [src/foo.ts]; decisions: [none]; open: [none]',
    });
  });

  it('a phase with only the skeleton placeholder — never actually closed — carries no entry at all', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [ ] `<ts>` DONE',
      '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
    ].join('\n');
    assert.deepStrictEqual(parsePhaseHandoffs(log), {});
  });

  it('a fix-repeat of the same phase in a later round overrides the earlier real close', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` DONE',
      '**Handoff →** artifacts: [src/old.ts]; decisions: [none]; open: [none]',
      '### Round 2 — 2026-06-22, fix F-01',
      '#### P1',
      '- [x] `2026-06-22T10:00:00Z` DONE',
      '**Handoff →** artifacts: [src/new.ts]; decisions: [none]; open: [none]',
    ].join('\n');
    assert.deepStrictEqual(parsePhaseHandoffs(log), {
      P1: '**Handoff →** artifacts: [src/new.ts]; decisions: [none]; open: [none]',
    });
  });
});
