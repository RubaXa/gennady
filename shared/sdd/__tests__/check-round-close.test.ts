// @file: Unit tests for the Execution Log post-close integrity checks in checkTicket (B2-04).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket } from '../check.ts';

/** @purpose Build a minimal ticket carrying only a META + EXECUTION_LOG (no Phases Overview — the
 *   B2-04 checks run unconditionally on any readable log, unlike the B2-07/B2-16 phase checks). */
function ticket(executionLog: string): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-foo',
    '- **Status:** [ ] TODO',
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    executionLog,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

const codes = (content: string): string[] => checkTicket('t.md', content).map((f) => f.code);

describe('checkTicket — Execution Log post-close integrity (B2-04)', () => {
  it('a clean closed Round → no post-close findings', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(!c.some((code) => code.startsWith('SDD_EXECUTION_LOG_')), c.join(','));
  });

  it('flags SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE for a checked line appended after Round close', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
          '#### P1 — re-run: fix',
          '- [x] `2026-06-21T11:00:00Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE'), c.join(','));
  });

  it('does not flag ENTRY_AFTER_CLOSE for a fresh new Round after the prior one closed', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
          '',
          '### Round 2 — 2026-06-22, fix',
          '#### P1 — re-run: fix',
          '- [x] `2026-06-22T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-22T10:00:01Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE'), c.join(','));
  });

  it('flags SDD_EXECUTION_LOG_CLOSE_EXTRA_ENTRY for an extra checked line inside the close block', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:00.5Z` insight sneaked in',
          '- [x] `2026-06-21T10:00:01Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_CLOSE_EXTRA_ENTRY'), c.join(','));
  });

  it('flags SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE for a phase entry timestamped after the close DONE', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '- [x] `2026-06-21T12:00:00Z` insight backdated into the block',
          '#### Round close',
          '- [x] `2026-06-21T10:00:01Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE'), c.join(','));
  });

  it('does not flag ENTRY_LATER_THAN_CLOSE for equal-precision-equal timestamps (T09:00Z vs T09:00:00Z)', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00Z` DONE',
          '#### Round close',
          '- [x] `2026-06-21T10:00:00Z` DONE',
        ].join('\n')
      )
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE'), c.join(','));
  });

  it('flags SDD_EXECUTION_LOG_ROUND_UNCLOSED when a Round has a checked line but no Round close', () => {
    const c = codes(
      ticket(
        ['### Round 1 — 2026-06-21, initial', '#### P1', '- [x] `2026-06-21T10:00:00Z` DONE'].join(
          '\n'
        )
      )
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_ROUND_UNCLOSED'), c.join(','));
  });

  it('does not flag ROUND_UNCLOSED on a pristine Round skeleton with no checked lines at all (C5)', () => {
    const c = codes(
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [ ] `<ts>` DONE',
          '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
        ].join('\n')
      )
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_ROUND_UNCLOSED'), c.join(','));
  });

  it('every new B2-04 code is a WARN, never an error (L-3)', () => {
    const findings = checkTicket(
      't.md',
      ticket(
        [
          '### Round 1 — 2026-06-21, initial',
          '#### P1',
          '- [x] `2026-06-21T10:00:00Z` DONE',
          '- [x] `2026-06-21T12:00:00Z` insight backdated',
          '#### Round close',
          '- [x] `2026-06-21T09:00:00Z` insight extra',
          '- [x] `2026-06-21T10:00:01Z` DONE',
          '#### P1 — re-run: fix',
          '- [x] `2026-06-21T11:00:00Z` DONE',
        ].join('\n')
      )
    );
    const b204 = findings.filter((f) => f.code.startsWith('SDD_EXECUTION_LOG_'));
    assert.ok(b204.length >= 3, b204.map((f) => f.code).join(','));
    assert.ok(
      b204.every((f) => f.severity === 'warn'),
      JSON.stringify(b204)
    );
  });
});
