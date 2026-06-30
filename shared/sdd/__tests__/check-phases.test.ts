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
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
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
});
