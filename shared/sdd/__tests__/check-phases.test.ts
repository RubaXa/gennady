// @file: Unit tests for the per-ticket phase-graph + exec-log completeness checks in checkTicket.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTicket } from '../check.ts';

/** Build a minimal ticket: META(status) + a Phases Overview + the named phase sections + EXECUTION_LOG. */
function ticket(opts: {
  status?: string;
  rows: Array<{ id: string; deps?: string; status?: string }>;
  sections: string[];
  receiptAware?: boolean;
  executionLog?: string;
}): string {
  const overview = [
    '| id | kind | deps | status |',
    '|----|------|------|--------|',
    ...opts.rows.map((r) => `| ${r.id} | impl | ${r.deps ?? '—'} | ${r.status ?? '[ ]'} |`),
  ].join('\n');
  const phaseSections = opts.sections
    .map(
      (id) =>
        `<!--SECTION:PHASE_${id}-->\n### ${id}\n- **Objective:** do ${id}\n<!--/SECTION:PHASE_${id}-->`
    )
    .join('\n\n');
  return [
    '<!--SECTION:META-->',
    '## 1. Meta',
    '- **Task-ID:** `cli-foo`',
    `- **Status:** ${opts.status ?? '[ ] TODO'}`,
    '<!--/SECTION:META-->',
    '',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '## 2. Phases Overview',
    overview,
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '',
    phaseSections,
    '',
    ...(opts.receiptAware ? ['<!--PHASE_RECEIPTS:v1-->', ''] : []),
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    opts.executionLog ?? '',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

const codes = (file: string, content: string): string[] =>
  checkTicket(file, content).map((f) => f.code);

describe('checkTicket — phase graph + exec-log completeness', () => {
  it('clean ticket → no phase findings', () => {
    const c = codes(
      't.md',
      ticket({ rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }], sections: ['P1', 'P2'] })
    );
    assert.ok(
      !c.some((x) => x.startsWith('SDD_PHASE') || x === 'SDD_DONE_PHASE_UNCHECKED'),
      c.join(',')
    );
  });

  it('flags a phase dep that names an unknown phase', () => {
    const c = codes(
      't.md',
      ticket({ rows: [{ id: 'P1' }, { id: 'P2', deps: 'P9' }], sections: ['P1', 'P2'] })
    );
    assert.ok(c.includes('SDD_PHASE_DEP_UNRESOLVED'));
  });

  it('flags a cycle in phase deps', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [
          { id: 'P1', deps: 'P2' },
          { id: 'P2', deps: 'P1' },
        ],
        sections: ['P1', 'P2'],
      })
    );
    assert.ok(c.includes('SDD_PHASE_DAG_CYCLE'));
  });

  it('flags an overview phase with no PHASE section', () => {
    const c = codes(
      't.md',
      ticket({ rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }], sections: ['P1'] })
    );
    assert.ok(c.includes('SDD_PHASE_SECTION_MISSING'));
  });

  it('flags a PHASE section with no overview row', () => {
    const c = codes('t.md', ticket({ rows: [{ id: 'P1' }], sections: ['P1', 'P3'] }));
    assert.ok(c.includes('SDD_PHASE_SECTION_ORPHAN'));
  });

  it('flags a DONE ticket with an unchecked phase', () => {
    const c = codes(
      't.md',
      ticket({
        status: '[x] DONE',
        rows: [
          { id: 'P1', status: '[x]' },
          { id: 'P2', deps: 'P1', status: '[ ]' },
        ],
        sections: ['P1', 'P2'],
      })
    );
    assert.ok(c.includes('SDD_DONE_PHASE_UNCHECKED'));
  });

  it('accepts exactly one Round 1 block per overview phase and ignores later rounds and fenced headings', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }],
        sections: ['P1', 'P2'],
        receiptAware: true,
        executionLog: [
          '### Round 1 — 2026-09-02, initial',
          '#### P1',
          '```markdown',
          '#### P9',
          '```',
          '#### P2',
          '#### Round close',
          '### Round 2 — 2026-09-03, fix',
          '#### P1 — re-run: fix F-1',
        ].join('\n'),
      })
    );
    assert.ok(!c.some((code) => code.startsWith('SDD_EXECUTION_LOG_')), c.join(','));
  });

  it('flags a Round 1 phase block missing from the overview plan', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }],
        sections: ['P1', 'P2'],
        receiptAware: true,
        executionLog: '### Round 1 — 2026-09-02, initial\n#### P1',
      })
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_PHASE_MISSING'));
  });

  it('flags duplicate and orphan Round 1 phase blocks', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }],
        sections: ['P1', 'P2'],
        receiptAware: true,
        executionLog: [
          '### Round 1 — 2026-09-02, initial',
          '#### P1',
          '#### P1 — re-run: retry',
          '#### P2',
          '#### P3',
        ].join('\n'),
      })
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_PHASE_DUPLICATE'));
    assert.ok(c.includes('SDD_EXECUTION_LOG_PHASE_ORPHAN'));
  });

  it('flags a missing Round 1 for the current receipt-aware contract', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }],
        sections: ['P1'],
        receiptAware: true,
        executionLog: '### Round 2 — 2026-09-03, fix\n#### P1',
      })
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_ROUND_MISSING'));
  });

  it('grandfathers an older V2 ticket without the receipt schema marker', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }],
        sections: ['P1', 'P2'],
        executionLog: '### Round 2 — 2026-09-03, historical\n#### P1',
      })
    );
    assert.ok(!c.some((code) => code.startsWith('SDD_EXECUTION_LOG_')), c.join(','));
  });
});
