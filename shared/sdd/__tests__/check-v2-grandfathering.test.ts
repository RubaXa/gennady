// @file: Regression proof that #40/#48 journal rules start at the per-scope v2 migration boundary.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket } from '../check.ts';

const NEW_V2_CODES = new Set([
  'SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE',
  'SDD_EXECUTION_LOG_CLOSE_EXTRA_ENTRY',
  'SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE',
  'SDD_EXECUTION_LOG_ROUND_UNCLOSED',
  'SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE',
  'SDD_REOPENS_MISMATCH',
  'SDD_REOPENS_PENDING',
  'SDD_EXECUTION_LOG_UNKNOWN_TOKEN',
  'SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED',
]);

function ticket(log: string, extra = ''): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** cli-grandfathering',
    '- **Status:** [~] IN_PROGRESS',
    '- **Reopens:** 0',
    '<!--/SECTION:META-->',
    extra,
    '<!--SECTION:EXECUTION_LOG-->',
    log,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

const audit = [
  '## Audit Rounds',
  '### Audit Round 1 — 2026-09-12, after Execution Round 1',
  '```',
  '@audit task=cli-grandfathering round=1 mode=per-task after-exec-round=1 triggered-reopen=Round-2 status=FAIL counts=B1·M0·m0·I0 phases_to_fix=[P1]',
  '@glossary suggestions=[]',
  '```',
].join('\n');

const phasePlan = [
  '<!--SECTION:PHASES_OVERVIEW-->',
  '| id | kind | deps | status |',
  '|----|------|------|--------|',
  '| P1 | impl | — | [ ] |',
  '<!--/SECTION:PHASES_OVERVIEW-->',
  '<!--SECTION:PHASE_P1-->',
  '### P1',
  '<!--/SECTION:PHASE_P1-->',
].join('\n');

const cases: ReadonlyArray<{ code: string; content: string }> = [
  {
    code: 'SDD_EXECUTION_LOG_ENTRY_AFTER_CLOSE',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T10:00:00Z` DONE\n#### Round close\n- [x] `2026-09-12T10:00:01Z` DONE\n#### P1\n- [x] `2026-09-12T10:00:02Z` discovery late'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_CLOSE_EXTRA_ENTRY',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T10:00:00Z` DONE\n#### Round close\n- [x] `2026-09-12T10:00:00.5Z` insight extra\n- [x] `2026-09-12T10:00:01Z` DONE'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_ENTRY_LATER_THAN_CLOSE',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T12:00:00Z` insight late\n#### Round close\n- [x] `2026-09-12T10:00:01Z` DONE'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_ROUND_UNCLOSED',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T10:00:00Z` DONE'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_UNKNOWN_TOKEN',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T10:00:00Z` invented-token detail'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_TIMESTAMP_UNQUOTED',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] 2026-09-12T10:00:00Z decision detail'
    ),
  },
  {
    code: 'SDD_REOPENS_MISMATCH',
    content: ticket('### Round 1 — 2026-09-12, initial', audit),
  },
  {
    code: 'SDD_REOPENS_PENDING',
    content: ticket('### Round 1 — 2026-09-12, initial', audit).replace(
      '- **Reopens:** 0',
      '- **Reopens:** 1'
    ),
  },
  {
    code: 'SDD_EXECUTION_LOG_PHASE_UNRECEIPTED_DONE',
    content: ticket(
      '### Round 1 — 2026-09-12, initial\n#### P1\n- [x] `2026-09-12T10:00:00Z` DONE',
      phasePlan
    ),
  },
];

describe('checkTicket — v1 grandfathering for #40/#48 journal rules', () => {
  it('an anchored legacy/v1 ticket emits none of the new findings', () => {
    for (const example of cases) {
      const found = checkTicket('tasks/legacy/t.task.md', example.content, 'v1')
        .map((finding) => finding.code)
        .filter((code) => NEW_V2_CODES.has(code));
      assert.deepStrictEqual(found, [], `${example.code}: ${found.join(',')}`);
    }
  });

  it('the equivalent migrated/v2 tickets emit every corresponding finding', () => {
    for (const example of cases) {
      const found = checkTicket('specs/current/current.task.md', example.content, 'v2').map(
        (finding) => finding.code
      );
      assert.ok(found.includes(example.code), `${example.code}: ${found.join(',')}`);
    }
  });
});
