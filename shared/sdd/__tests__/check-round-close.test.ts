// @file: Unit tests for the Execution Log post-close integrity checks in checkTicket (B2-04).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTicket } from '../check.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, 'fixtures', 'round-close');
const DA_LAZY_ASM_GOLDEN = path.join(FIXTURE_DIR, 'DA-lazy-asm.execution-log.golden.json');

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

// V-BATCH-14 nonblocking #7: L-3 (variant 2) names a golden snapshot of the real corpus artifact
// `directive-assembly.task.DA-lazy-asm.md` as the PRECONDITION for ever flipping these four B2-04
// codes from warn to error — R-B2-04.md §4 had only verified the pattern by hand (no committed
// fixture). This materializes that precondition: a frozen copy of the ticket's own EXECUTION_LOG
// body (`fixtures/round-close/DA-lazy-asm.execution-log.frozen.md` — `#### Round close` on its own
// line 167, followed by three post-close re-run blocks, matching the real file's lines 768/772/
// 786/806) plus a committed golden of every SDD_EXECUTION_LOG_* finding `checkTicket` produces on
// it today. A future warn→error flip (B2-20) that changes this golden's severities is exactly the
// signal B2-20 needs to see; an unrelated code change that reddens it is a real regression.
describe('golden: DA-lazy-asm real corpus artifact (V-BATCH-14 nonblocking #7, L-3 precondition)', () => {
  function updateGolden(): boolean {
    return process.env.UPDATE_ROUND_CLOSE_GOLDEN === '1';
  }

  it('checkTicket on the frozen DA-lazy-asm Execution Log matches the committed golden', () => {
    const executionLog = readFileSync(
      path.join(FIXTURE_DIR, 'DA-lazy-asm.execution-log.frozen.md'),
      'utf-8'
    );
    const findings = checkTicket('t.md', ticket(executionLog))
      .filter((f) => f.code.startsWith('SDD_EXECUTION_LOG_'))
      // `line` omitted: none of the four B2-04 codes populate it today (verified against this very
      // fixture) — including it as an explicit `undefined` would make deepStrictEqual disagree
      // with the parsed-JSON golden, which drops `undefined` keys entirely on write.
      .map((f) => ({ code: f.code, severity: f.severity, message: f.message }));

    if (updateGolden()) {
      writeFileSync(DA_LAZY_ASM_GOLDEN, `${JSON.stringify(findings, null, 2)}\n`);
      return;
    }

    assert.ok(
      existsSync(DA_LAZY_ASM_GOLDEN),
      `missing ${DA_LAZY_ASM_GOLDEN} — regenerate with UPDATE_ROUND_CLOSE_GOLDEN=1 npm test`
    );
    const expected: unknown = JSON.parse(readFileSync(DA_LAZY_ASM_GOLDEN, 'utf-8'));
    assert.deepStrictEqual(
      findings,
      expected,
      'DA-lazy-asm golden drifted — if deliberate (e.g. B2-20 flipping warn→error), regenerate ' +
        'with: UPDATE_ROUND_CLOSE_GOLDEN=1 npm test'
    );
  });

  it('every finding in the golden is a warn (still L-3 variant 2 — pre-B2-20)', () => {
    const executionLog = readFileSync(
      path.join(FIXTURE_DIR, 'DA-lazy-asm.execution-log.frozen.md'),
      'utf-8'
    );
    const findings = checkTicket('t.md', ticket(executionLog)).filter((f) =>
      f.code.startsWith('SDD_EXECUTION_LOG_')
    );
    assert.ok(
      findings.every((f) => f.severity === 'warn'),
      JSON.stringify(findings)
    );
  });
});
