// @file: Unit tests for causal Reopens (B2-06, issue #13, D-20) — Meta `Reopens` vs `## Audit
//   Rounds` `@audit … triggered-reopen=Round-N` records, plus the closed round-reason vocabulary.
// @consumers: execution-log, check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditRounds, isValidRoundReason } from '../execution-log.ts';
import { checkTicket } from '../check.ts';

/** @purpose Minimal EXECUTION_LOG section with plain `### Round <n>` headings, no phase content needed by these tests. */
function execLog(...roundLabels: string[]): string {
  return [
    '<!--SECTION:EXECUTION_LOG-->',
    ...roundLabels.map((label) => `### ${label}`),
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

/** @purpose One `### Audit Round <n>` block in `## Audit Rounds`, fenced `@audit` grammar line. */
function auditRoundBlock(
  n: number,
  afterExecRound: number,
  triggeredReopen: string,
  status: string
): string {
  return [
    `### Audit Round ${n} — 2026-05-1${n}, after Execution Round ${afterExecRound}`,
    '```',
    `@audit task=TSK-04 round=${n} mode=per-task after-exec-round=${afterExecRound} triggered-reopen=${triggeredReopen} status=${status} counts=B1·M0·m0·I0 phases_to_fix=[P2]`,
    'F-01 | sev=M | type=CLOSED_WORLD_DRIFT | conf=H | loc=x:1 | phase=P2 | src=y | route=ticket-reopen | act=z',
    '@glossary suggestions=[]',
    '```',
    '',
  ].join('\n');
}

function ticket(reopens: number | null, auditRounds: string, log: string): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-foo',
    '- **Status:** [~] IN_PROGRESS',
    ...(reopens !== null ? [`- **Reopens:** ${reopens}`] : []),
    '<!--/SECTION:META-->',
    '## Audit Rounds',
    '',
    auditRounds,
    log,
  ].join('\n');
}

/** @purpose Only this test's own concern — `checkTicket`'s other, unrelated findings don't matter here. */
function reopensFindings(content: string): { code: string; severity: string }[] {
  return checkTicket('t.md', content)
    .filter((f) => f.code.startsWith('SDD_REOPENS_'))
    .map((f) => ({ code: f.code, severity: f.severity }));
}

describe('parseAuditRounds', () => {
  it('parses n, afterExecRound, triggeredReopen and verdict from the fenced @audit line', () => {
    const content = ticket(
      1,
      auditRoundBlock(1, 1, 'Round-2', 'FAIL'),
      execLog('Round 1 — 2026-05-11, initial')
    );
    const records = parseAuditRounds(content);
    assert.deepStrictEqual(records, [
      { n: 1, afterExecRound: 1, triggeredReopen: 2, verdict: 'FAIL' },
    ]);
  });

  it('triggered-reopen=none parses to null, not a round number', () => {
    const content = ticket(
      0,
      auditRoundBlock(1, 1, 'none', 'PASS_RISK'),
      execLog('Round 1 — 2026-05-11, initial')
    );
    const records = parseAuditRounds(content);
    assert.strictEqual(records[0]?.triggeredReopen, null);
  });

  it('no ## Audit Rounds heading at all → empty', () => {
    assert.deepStrictEqual(parseAuditRounds(execLog('Round 1 — 2026-05-11, initial')), []);
  });
});

describe('checkTicket — causal Meta Reopens vs @audit triggered-reopen (issue #13)', () => {
  it('Meta Reopens: 1 but TWO triggered-reopen records → SDD_REOPENS_MISMATCH', () => {
    const auditRounds =
      auditRoundBlock(1, 1, 'Round-2', 'FAIL') + auditRoundBlock(2, 2, 'Round-3', 'FAIL');
    const content = ticket(
      1,
      auditRounds,
      execLog(
        'Round 1 — 2026-05-11, initial',
        'Round 2 — 2026-05-12, fix: F-01',
        'Round 3 — 2026-05-13, fix: F-02'
      )
    );
    const findings = reopensFindings(content);
    assert.ok(findings.some((f) => f.code === 'SDD_REOPENS_MISMATCH' && f.severity === 'warn'));
    assert.ok(!findings.some((f) => f.code === 'SDD_REOPENS_PENDING'));
  });

  it('declared Round-4 while only three Rounds exist → SDD_REOPENS_PENDING (announced, not executed)', () => {
    const content = ticket(
      1,
      auditRoundBlock(1, 3, 'Round-4', 'FAIL'),
      execLog(
        'Round 1 — 2026-05-11, initial',
        'Round 2 — 2026-05-12, fix: F-01',
        'Round 3 — 2026-05-13, fix: F-02'
      )
    );
    const findings = reopensFindings(content);
    assert.ok(findings.some((f) => f.code === 'SDD_REOPENS_PENDING' && f.severity === 'warn'));
    assert.ok(!findings.some((f) => f.code === 'SDD_REOPENS_MISMATCH'));
  });

  it('triggered-reopen=none is not counted — honest zero-Reopens ticket stays clean', () => {
    const content = ticket(
      null,
      auditRoundBlock(1, 1, 'none', 'PASS_RISK'),
      execLog('Round 1 — 2026-05-11, initial')
    );
    assert.deepStrictEqual(reopensFindings(content), []);
  });

  it('no ## Audit Rounds section at all → no findings (nothing to be causally dishonest about)', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** cli-foo',
      '- **Status:** [x] DONE',
      '<!--/SECTION:META-->',
      execLog('Round 1 — 2026-05-11, initial'),
    ].join('\n');
    assert.deepStrictEqual(reopensFindings(content), []);
  });
});

describe('isValidRoundReason — closed vocabulary (D-20)', () => {
  it('accepts the four closed-vocabulary shapes', () => {
    for (const reason of ['initial', 'resume', 'new-audit-session', 'fix: F-01', 'fix:F-102']) {
      assert.ok(isValidRoundReason(reason), reason);
    }
  });

  it('rejects free text outside the vocabulary', () => {
    for (const reason of ['because reasons', 'fix', 'fix: bug-1', 'Initial', '']) {
      assert.ok(!isValidRoundReason(reason), reason);
    }
  });
});
