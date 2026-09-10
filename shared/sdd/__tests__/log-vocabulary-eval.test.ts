// @file: E-05 (`E-G3-log-vocabulary`) — 4 both-way groups on synthetic tickets, proving
//   shared/sdd/execution-log.ts's parser + shared/sdd/check.ts's mechanical checks catch exactly
//   the drift issues #13/#15/#23 named: an unknown token, an edit appended after Round close, a
//   causally dishonest Reopens count, and `nextRoundNumber` misled by a legacy `## Critic Rounds`.
//   Each group is a PAIR — the trigger case and the honest/clean case that must stay silent.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket } from '../check.ts';
import { nextRoundNumber } from '../execution-log.ts';

/** @purpose Minimal but complete synthetic ticket — META + EXECUTION_LOG, nothing receipt-aware. */
function ticket(status: string, log: string, extra = ''): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-log-vocab',
    `- **Status:** ${status}`,
    '<!--/SECTION:META-->',
    extra,
    '<!--SECTION:EXECUTION_LOG-->',
    log,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function codes(content: string): string[] {
  return checkTicket('t.md', content).map((f) => f.code);
}

describe('E-05 group 1 — unknown token (issue #23)', () => {
  it('TRIGGER: a checked event line opens with a token outside the closed vocabulary', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` fabricatedToken this is not a real vocabulary word',
      '- [x] `2026-06-21T10:00:01Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:02Z` DONE',
    ].join('\n');
    assert.ok(codes(ticket('[~] IN_PROGRESS', log)).includes('SDD_EXECUTION_LOG_UNKNOWN_TOKEN'));
  });

  it('CLEAN: every checked event line opens with a real vocabulary token', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` discovery a real fact worth recording',
      '- [x] `2026-06-21T10:00:01Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:02Z` DONE',
    ].join('\n');
    assert.ok(!codes(ticket('[~] IN_PROGRESS', log)).includes('SDD_EXECUTION_LOG_UNKNOWN_TOKEN'));
  });

  // V-BATCH-15 F-4: an unquoted timestamp is a distinct grammar defect, not a vocabulary
  // violation — the real token (`decision`, legal) sits one word past the misread "token"
  // (the bare timestamp itself). Verified against the exact live-corpus shape
  // (agent-inbox.task-159.md:174): `- [x] 2026-08-06T12:15:00Z decision priority_tiers = …`.
  it('TRIGGER: an unquoted timestamp is flagged as SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED, not SDD_EXECUTION_LOG_UNKNOWN_TOKEN', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] 2026-06-21T10:00:00Z decision priority_tiers = high ← operator call',
      '- [x] `2026-06-21T10:00:01Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:02Z` DONE',
    ].join('\n');
    const found = codes(ticket('[~] IN_PROGRESS', log));
    assert.ok(found.includes('SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED'));
    assert.ok(!found.includes('SDD_EXECUTION_LOG_UNKNOWN_TOKEN'));
  });

  it('CLEAN: the same event, timestamp backtick-wrapped, triggers neither code', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` decision priority_tiers = high ← operator call',
      '- [x] `2026-06-21T10:00:01Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:02Z` DONE',
    ].join('\n');
    const found = codes(ticket('[~] IN_PROGRESS', log));
    assert.ok(!found.includes('SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED'));
    assert.ok(!found.includes('SDD_EXECUTION_LOG_UNKNOWN_TOKEN'));
  });
});

describe('E-05 group 2 — edit appended after Round close (D-8/B2-04)', () => {
  it("TRIGGER: a checked line lands after the Round's own `#### Round close`", () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:01Z` DONE',
      '- [x] `2026-06-21T10:00:02Z` discovery snuck in after close',
    ].join('\n');
    assert.ok(
      codes(ticket('[~] IN_PROGRESS', log)).includes('SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE')
    );
  });

  it('CLEAN: nothing appears after the Round close', () => {
    const log = [
      '### Round 1 — 2026-06-21, initial',
      '#### P1',
      '- [x] `2026-06-21T10:00:00Z` DONE',
      '#### Round close',
      '- [x] `2026-06-21T10:00:01Z` DONE',
    ].join('\n');
    assert.ok(
      !codes(ticket('[~] IN_PROGRESS', log)).includes('SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE')
    );
  });
});

describe('E-05 group 3 — causally dishonest Reopens (issue #13, D-20, B2-06)', () => {
  const auditRounds = [
    '## Audit Rounds',
    '',
    '### Audit Round 1 — 2026-06-22, after Execution Round 1',
    '```',
    '@audit task=cli-log-vocab round=1 mode=per-task after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B1·M0·m0·I0 phases_to_fix=[P1]',
    'F-01 | sev=M | type=CLOSED_WORLD_DRIFT | conf=H | loc=x:1 | phase=P1 | src=y | route=ticket-reopen | act=z',
    '@glossary suggestions=[]',
    '```',
    '',
  ].join('\n');
  const log = [
    '### Round 1 — 2026-06-21, initial',
    '#### P1',
    '- [x] `2026-06-21T10:00:00Z` DONE',
    '#### Round close',
    '- [x] `2026-06-21T10:00:01Z` DONE',
    '### Round 2 — 2026-06-22, fix: F-01',
    '#### P1 — re-run: fix F-01',
    '- [x] `2026-06-22T10:00:00Z` DONE',
    '#### Round close',
    '- [x] `2026-06-22T10:00:01Z` DONE',
  ].join('\n');

  it('TRIGGER: Meta Reopens: 0 while an audit round declared triggered-reopen=Round-2', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-log-vocab',
      '- **Status:** [~] IN_PROGRESS',
      '<!--/SECTION:META-->',
      auditRounds,
      '<!--SECTION:EXECUTION_LOG-->',
      log,
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    assert.ok(codes(content).includes('SDD_REOPENS_MISMATCH'));
  });

  it('CLEAN: Meta Reopens: 1 matches the one triggering audit round', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-log-vocab',
      '- **Status:** [~] IN_PROGRESS',
      '- **Reopens:** 1',
      '<!--/SECTION:META-->',
      auditRounds,
      '<!--SECTION:EXECUTION_LOG-->',
      log,
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    assert.ok(!codes(content).includes('SDD_REOPENS_MISMATCH'));
    assert.ok(!codes(content).includes('SDD_REOPENS_PENDING'));
  });
});

describe('E-05 group 4 — nextRoundNumber reads only the EXECUTION_LOG section (issue #15)', () => {
  it('TRIGGER shape: a migrated ticket carries a legacy `## Critic Rounds` section with a HIGHER round number outside the log — nextRoundNumber must not be misled by it', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-log-vocab',
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-06-20, initial',
      '<!--/SECTION:EXECUTION_LOG-->',
      '',
      '## Critic Rounds',
      '### Round 7 — 2026-05-30',
    ].join('\n');
    // The real next Round is 2 (log has only Round 1) — NOT 8 (which a file-wide, section-blind
    // scan would wrongly derive from the Critic Rounds' Round 7).
    assert.strictEqual(nextRoundNumber(content), 2);
  });

  it('CLEAN shape: no Critic Rounds section at all — same ticket gives the same answer', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-log-vocab',
      '<!--/SECTION:META-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-06-20, initial',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    assert.strictEqual(nextRoundNumber(content), 2);
  });
});
