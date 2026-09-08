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

  // B2-16 (finding C fix): the check targets the CURRENT (latest) Round, not the literal heading
  // text "Round 1" — a receipt-aware ticket whose only/current Round happens to be numbered 2 (as
  // on the real corpus's directive-assembly.task.DA-lazy-asm.md) must NOT false-positive.
  it('does not flag a missing round when the current (sole) round is not literally numbered 1', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }],
        sections: ['P1'],
        receiptAware: true,
        executionLog: '### Round 2 — 2026-09-03, fix\n#### P1',
      })
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_ROUND_MISSING'), c.join(','));
  });

  it('flags a missing round when receipt-aware and Execution Log has no `### Round <n>` at all', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }],
        sections: ['P1'],
        receiptAware: true,
        executionLog: 'no round header here',
      })
    );
    assert.ok(c.includes('SDD_EXECUTION_LOG_ROUND_MISSING'));
  });

  it('picks the FIRST round when several exist, ignoring later narrower fix rounds', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }, { id: 'P2', deps: 'P1' }],
        sections: ['P1', 'P2'],
        receiptAware: true,
        executionLog: [
          '### Round 1 — 2026-09-01, initial',
          '#### P1',
          '#### P2',
          '#### Round close',
          '### Round 3 — 2026-09-05, fix',
          '#### P1 — re-run: fix',
        ].join('\n'),
      })
    );
    assert.ok(!c.some((code) => code.startsWith('SDD_EXECUTION_LOG_')), c.join(','));
  });

  // B2-16: a phase block re-opened AFTER the round's own `#### Round close` heading is trailing
  // (post-close) content, not a second per-phase skeleton block — it must not double-count into
  // SDD_EXECUTION_LOG_PHASE_DUPLICATE (that append-after-close case is B2-04's own code instead).
  it('does not count a phase block reopened after Round close as a duplicate', () => {
    const c = codes(
      't.md',
      ticket({
        rows: [{ id: 'P1' }],
        sections: ['P1'],
        receiptAware: true,
        executionLog: [
          '### Round 1 — 2026-09-01, initial',
          '#### P1',
          '#### Round close',
          '#### P1 — re-run: post-close fix',
        ].join('\n'),
      })
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_PHASE_DUPLICATE'), c.join(','));
  });

  // B2-16/L-2 (variant 3) names a second predicate — "a v2-named `*.task.<ID>.md` file is ALWAYS
  // receipt-aware, even with no literal marker" — NOT implemented in this batch: measured against
  // the real test-fixture corpus, 31 unrelated `.test.ts` files already use v2-shaped ticket names
  // in fixtures that predate this predicate and carry no Round/receipt scaffold, so wiring it in
  // here would redden ~9 unrelated suites outside this batch's file zone (bootstrap-path,
  // clean-repo-composition, sdd-verify, inbox-review-plan, testcov, directive-tool-contract, …).
  // Left as a literal-marker-only gate (pre-existing behavior) — see the batch report's Deviations.
  it('stays grandfathered on the literal marker for a v2-named ticket file with no marker (deviation from L-2)', () => {
    const c = codes(
      'specs/demo/core/core.task.DEM-work.md',
      ticket({
        rows: [{ id: 'P1' }],
        sections: ['P1'],
        receiptAware: false,
        executionLog: 'no round header here',
      })
    );
    assert.ok(!c.includes('SDD_EXECUTION_LOG_ROUND_MISSING'), c.join(','));
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

  // B2-08/B2-09: a ticket anchor-injected from v1 keeps PHASES_OVERVIEW's original
  // `| Phase | Kind | Status | Target Files | Deps |` column order. checkTicket must not read the
  // header row `| Phase | ... |` as a phase named "Phase", and must not confuse the Status column
  // (index 2 here) with the Deps column (index 4 here) on any real data row.
  it('a v1-order PHASES_OVERVIEW header never becomes a phase, and Status/Deps are not swapped', () => {
    const raw = [
      '<!--SECTION:META-->',
      '## 1. Meta',
      '- **Task-ID:** `cli-foo`',
      '- **Status:** [~] IN_PROGRESS',
      '<!--/SECTION:META-->',
      '',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '## 2. Phases Overview',
      '| Phase | Kind | Status | Target Files | Deps |',
      '|-------|------|--------|--------------|------|',
      '| P1 | impl | [x] | src/foo.ts | — |',
      '| P2 | test | [ ] | src/foo.test.ts | P1 |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '',
      '<!--SECTION:PHASE_P1-->',
      '### P1',
      '- **Objective:** do P1',
      '<!--/SECTION:PHASE_P1-->',
      '',
      '<!--SECTION:PHASE_P2-->',
      '### P2',
      '- **Objective:** do P2',
      '<!--/SECTION:PHASE_P2-->',
      '',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    const c = codes('t.md', raw);
    assert.ok(!c.includes('SDD_PHASE_DAG_CYCLE'), c.join(','));
    assert.ok(!c.includes('SDD_PHASE_DEP_UNRESOLVED'), c.join(','));
    assert.ok(!c.includes('SDD_PHASE_SECTION_ORPHAN'), c.join(','));
  });
});
