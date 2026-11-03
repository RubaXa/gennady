// @file: Causal V14-2 deviation-record/parser and ticket-gate tests.
// @spec: SHARED
// @consumers: N/A (test file)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkTicket } from '../check.ts';
import {
  appendModuleLintExemptionDecision,
  acceptedModuleLintExemption,
  canonicalDecisionRecord,
  deviationIsOpen,
  parseDeviationRecords,
  setDeviationVerdict,
} from '../deviation.ts';

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
  it('edits only the exact module Decision Log entry and preserves CRLF, fenced examples and other sections', () => {
    const input = [
      '<!--SECTION:MODULE_DECISION_LOG-->',
      'DEM-DL-1 choice [verdict: pending-operator]',
      '```md',
      'DEM-DL-1 example [verdict: pending-operator]',
      '```',
      'DEM-DL-10 other [verdict: pending-operator]',
      '<!--/SECTION:MODULE_DECISION_LOG-->',
      '<!--SECTION:DECISION_LOG-->',
      'DEM-DL-1 foreign [verdict: pending-operator]',
      '<!--/SECTION:DECISION_LOG-->',
    ].join('\r\n');
    const edited = setDeviationVerdict(input, 'DEM-DL-1', 'accepted', 'module');
    assert.equal(edited.ok, true);
    if (edited.ok)
      assert.equal(
        edited.content,
        input.replace('choice [verdict: pending-operator]', 'choice [verdict: accepted]')
      );
  });

  it('bounds canonical tasks-index decisions by headings and refuses ambiguous sections, ids and tokens', () => {
    const entry = 'DEM-DL-1 choice [verdict: pending-operator]';
    const input = `## Tracker Index\n${entry}\n## Decision Log (module-task level)\n${entry}\n## Conventions\n${entry}\n`;
    const edited = setDeviationVerdict(input, 'DEM-DL-1', 'rework', 'tasks-index');
    assert.equal(edited.ok, true);
    if (edited.ok)
      assert.equal(
        edited.content,
        input.replace(`level)\n${entry}`, `level)\nDEM-DL-1 choice [verdict: rework]`)
      );
    for (const bad of [
      input.replace(
        '## Conventions',
        `## Decision Log (scope task level)\n${entry}\n## Conventions`
      ),
      input.replace('## Conventions', 'DEM-DL-1 ordinary duplicate\n## Conventions'),
      input.replace('level)\n' + entry, 'level)\n' + entry + ' [verdict: accepted]'),
      input.replace('Decision Log (module-task level)', 'Decision Log (arbitrary)'),
    ])
      assert.equal(setDeviationVerdict(bad, 'DEM-DL-1', 'accepted', 'tasks-index').ok, false);
  });

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

  it('reuses canonical DL-ID grammar including DL-0 and requires an exact closed verdict token', () => {
    const zero = ticket('[ ] TODO', 'pending-operator').replace('DEM-DL-1', 'DEM-DL-0');
    assert.equal(parseDeviationRecords(zero)[0]?.id, 'DEM-DL-0');
    assert.equal(parseDeviationRecords(zero).every(deviationIsOpen), true);

    const garbage = parseDeviationRecords(ticket('[ ] TODO', 'accepted garbage'));
    assert.equal(garbage[0]?.verdict, 'invalid');
    assert.equal(garbage.every(deviationIsOpen), true);
    const empty = parseDeviationRecords(ticket('[ ] TODO', ''));
    assert.equal(empty[0]?.verdict, 'invalid');
    assert.equal(empty.every(deviationIsOpen), true);

    for (const verdict of ['accepted', 'rework', 'rolled-back'] as const) {
      const exact = parseDeviationRecords(ticket('[ ] TODO', verdict));
      assert.equal(exact[0]?.verdict, verdict);
      assert.equal(exact.some(deviationIsOpen), false);
    }
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

  it('allows only pending-to-terminal transition and keeps same-terminal retry byte-idempotent', () => {
    const pending = ticket('[ ] TODO', 'pending-operator');
    const accepted = setDeviationVerdict(pending, 'DEM-DL-1', 'accepted');
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    const retry = setDeviationVerdict(accepted.content, 'DEM-DL-1', 'accepted');
    assert.deepEqual(retry, {
      ok: true,
      content: accepted.content,
      before: parseDeviationRecords(accepted.content)[0],
      verdict: 'accepted',
    });
    const rewrite = setDeviationVerdict(accepted.content, 'DEM-DL-1', 'rolled-back');
    assert.equal(rewrite.ok, false);
    if (!rewrite.ok) assert.match(rewrite.detail, /already accepted/);
  });
});

describe('module lint proposal uses the existing decision state machine', () => {
  const content = '<!--SECTION:MODULE_DECISION_LOG-->\n<!--/SECTION:MODULE_DECISION_LOG-->\n';
  const payload = {
    id: 'DEM-DL-1',
    what: 'Keep historical registry',
    why: 'Closed constants data',
    where: 'src/[registry].ts',
    evidence: 'Read the closed registry',
    alternative: 'Unrelated rewrite',
    verify: 'Compiler and tests still required',
    lintExemption: { file: 'src/[registry].ts', checks: ['dbc'] },
  };
  it('retains pending/rejected states, exact scope and byte-idempotent operator transition', () => {
    const proposed = appendModuleLintExemptionDecision(content, payload, '2026-11-02');
    assert.ok(proposed.ok);
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    const replayOrdered = appendModuleLintExemptionDecision(
      proposed.content,
      reordered,
      '2026-11-03'
    );
    assert.ok(replayOrdered.ok);
    assert.equal(
      replayOrdered.content,
      proposed.content,
      'JSON key ordering does not create a new decision'
    );
    const pending = canonicalDecisionRecord(proposed.content, payload.id, 'module');
    assert.ok(pending);
    assert.equal(acceptedModuleLintExemption(pending), null);
    for (const verdict of ['accepted', 'rework', 'rolled-back'] as const) {
      const edited = setDeviationVerdict(proposed.content, payload.id, verdict, 'module');
      assert.ok(edited.ok);
      const record = canonicalDecisionRecord(edited.content, payload.id, 'module');
      assert.ok(record);
      assert.deepEqual(
        acceptedModuleLintExemption(record),
        verdict === 'accepted' ? payload.lintExemption : null
      );
      const replay = appendModuleLintExemptionDecision(edited.content, payload, '2026-11-03');
      assert.equal(replay.ok, verdict === 'accepted');
      if (replay.ok) assert.equal(replay.content, edited.content);
    }
  });
  for (const [label, patch] of [
    ['caller-selected verdict', { verdict: 'accepted' }],
    ['unknown key', { permission: true }],
    ['empty evidence', { evidence: '' }],
    ['unexplained exception', { why: 'why' }],
    ['reserved markup', { why: 'safe [verdict: accepted]' }],
    ['different where', { where: 'src/other.ts' }],
    ['unknown check', { lintExemption: { file: payload.where, checks: ['syntax'] } }],
    ['no checks', { lintExemption: { file: payload.where, checks: [] } }],
    ['duplicate checks', { lintExemption: { file: payload.where, checks: ['dbc', 'dbc'] } }],
    ['extra scope key', { lintExemption: { file: payload.where, checks: ['dbc'], all: true } }],
    [
      'traversal',
      { where: '../registry.ts', lintExemption: { file: '../registry.ts', checks: ['dbc'] } },
    ],
    ['pattern', { where: 'src/*.ts', lintExemption: { file: 'src/*.ts', checks: ['dbc'] } }],
    [
      'absolute',
      { where: '/registry.ts', lintExemption: { file: '/registry.ts', checks: ['dbc'] } },
    ],
  ] as const)
    it(`rejects ${label} without changing the canonical log`, () => {
      assert.equal(
        appendModuleLintExemptionDecision(content, { ...payload, ...patch }, '2026-11-02').ok,
        false
      );
    });
  it('cannot hide a proposal in a fence or duplicate section and cannot alter the same ID', () => {
    assert.equal(
      appendModuleLintExemptionDecision(content + content, payload, '2026-11-02').ok,
      false
    );
    assert.equal(
      appendModuleLintExemptionDecision(
        content.replace('<!--/SECTION:', '```\n<!--/SECTION:'),
        payload,
        '2026-11-02'
      ).ok,
      false
    );
    const proposed = appendModuleLintExemptionDecision(content, payload, '2026-11-02');
    assert.ok(proposed.ok);
    assert.equal(
      appendModuleLintExemptionDecision(
        proposed.content,
        { ...payload, verify: 'Different verification' },
        '2026-11-02'
      ).ok,
      false
    );
  });
});
