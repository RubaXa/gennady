// @file: Causal V14-2 deviation-record/parser and ticket-gate tests.
// @spec: SHARED
// @consumers: N/A (test file)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkTicket } from '../check.ts';
import { deviationIsOpen, parseDeviationRecords, setDeviationVerdict } from '../deviation.ts';

function ticket(status: '[ ] TODO' | '[x] DONE', verdict: string): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** DEM-deviation',
    `- **Status:** ${status}`,
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '### Round 1 — 2026-09-22, initial',
    '<!--/SECTION:EXECUTION_LOG-->',
    '<!--SECTION:DECISION_LOG-->',
    `DEM-DL-1 2026-09-22 — retry cap 3; где: src/retry.ts#loop (почему: bounded) [verdict: ${verdict}]`,
    '<!--/SECTION:DECISION_LOG-->',
  ].join('\n');
}

describe('V14-2 deviation record', () => {
  it('is WARN while work is open, ERROR at DONE, and disappears after an accepted verdict', () => {
    const open = checkTicket('ticket.md', ticket('[ ] TODO', 'pending-operator'));
    const openFinding = open.filter((finding) => finding.code === 'SDD_DEVIATION_VERDICT_MISSING');
    assert.equal(openFinding.length, 1);
    assert.equal(openFinding[0]?.severity, 'warn');

    const done = checkTicket('ticket.md', ticket('[x] DONE', 'pending-operator'));
    assert.equal(
      done.find((finding) => finding.code === 'SDD_DEVIATION_VERDICT_MISSING')?.severity,
      'error'
    );
    assert.equal(
      checkTicket('legacy.md', ticket('[x] DONE', 'pending-operator'), 'v1').some(
        (finding) => finding.code === 'SDD_DEVIATION_VERDICT_MISSING'
      ),
      false
    );

    const edited = setDeviationVerdict(
      ticket('[x] DONE', 'pending-operator'),
      'DEM-DL-1',
      'accepted'
    );
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.deepEqual(
      checkTicket('ticket.md', edited.content).filter(
        (finding) => finding.code === 'SDD_DEVIATION_VERDICT_MISSING'
      ),
      []
    );
  });

  it('keeps an unknown verdict open and never mistakes ordinary Decision Log prose for a deviation', () => {
    const records = parseDeviationRecords(ticket('[ ] TODO', 'maybe'));
    assert.equal(records.length, 1);
    assert.equal(records[0]?.verdict, 'invalid');
    assert.equal(records.every(deviationIsOpen), true);
    assert.deepEqual(
      parseDeviationRecords(ticket('[ ] TODO', 'accepted').replace(' [verdict: accepted]', '')),
      []
    );
  });

  it('fails closed on duplicate ids and refuses pending as a resolution', () => {
    const duplicate = ticket('[ ] TODO', 'pending-operator').replace(
      '<!--/SECTION:DECISION_LOG-->',
      'DEM-DL-1 2026-09-22 — another choice (почему: duplicate) [verdict: pending-operator]\n<!--/SECTION:DECISION_LOG-->'
    );
    assert.equal(setDeviationVerdict(duplicate, 'DEM-DL-1', 'accepted').ok, false);
    assert.equal(
      setDeviationVerdict(ticket('[ ] TODO', 'pending-operator'), 'DEM-DL-1', 'pending-operator')
        .ok,
      false
    );
  });
});
