// @file: Canonical execution decisions, idempotency and Handoff orphan rejection.
// @spec: SHARED
// @consumers: CI

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendExecutionDecision,
  parseDeviationRecords,
  setDeviationVerdict,
} from '../deviation.ts';
import { completePhase } from '../../../cli/cmd/sdd-log/sdd-log.types.ts';
import { checkTicket } from '../check.ts';

const decision = {
  id: 'DEM-DL-1',
  what: 'Use an existing caller',
  why: 'The initial target omits its retry policy',
  where: 'src/retry.ts#retry',
  evidence: 'The caller requires a bounded retry',
  alternative: 'Unbounded retry would violate the caller contract',
  verify: 'Run the declared phase verification',
};
const ticket = [
  '<!--SECTION:PHASES_OVERVIEW-->',
  '| ID | Kind | Deps | Status |',
  '|---|---|---|---|',
  '| P1 | code | — | [ ] |',
  '<!--/SECTION:PHASES_OVERVIEW-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '### Round 1 — 2026-10-26, initial',
  '#### P1',
  '- [ ] `<ts>` DONE',
  '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
  '<!--/SECTION:EXECUTION_LOG-->',
  '<!--SECTION:DECISION_LOG-->',
  '<!--/SECTION:DECISION_LOG-->',
].join('\n');
const payload =
  'artifacts: [src/retry.ts]; decisions: [bounded retry]; open: []; deviations: [DEM-DL-1]';

describe('canonical execution decision', () => {
  it('records one pending decision, exposes it to verdict consumers and completes with the same reference', () => {
    const result = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(parseDeviationRecords(result.content)[0]?.verdict, 'pending-operator');
    assert.equal(setDeviationVerdict(result.content, decision.id, 'accepted').ok, true);
    assert.equal(
      completePhase(result.content, 'P1', payload, '2026-10-26T12:00:00Z', true).ok,
      true
    );
    assert.equal(result.content.replace(/DEM-DL-1[^\n]*\n/, ''), ticket);
  });

  it('keeps a lost-ack retry byte-idempotent across a new process date and preserves an operator verdict', () => {
    const initial = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    const accepted = setDeviationVerdict(initial.content, decision.id, 'accepted');
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    const retry = appendExecutionDecision(
      accepted.content,
      JSON.parse(JSON.stringify(decision)),
      'P1',
      '2026-10-27'
    );
    assert.deepEqual(retry, {
      ok: true,
      content: accepted.content,
      id: decision.id,
      created: false,
    });
  });

  it('rejects changed content or phase under an existing ID rather than overwriting it', () => {
    const initial = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    for (const [value, phase] of [
      [{ ...decision, what: 'Different choice' }, 'P1'],
      [decision, 'P2'],
    ] as const)
      assert.equal(appendExecutionDecision(initial.content, value, phase, '2026-10-26').ok, false);
  });

  it('never acknowledges a rejected operator choice as permission to apply it again', () => {
    const initial = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    for (const verdict of ['rework', 'rolled-back'] as const) {
      const rejected = setDeviationVerdict(initial.content, decision.id, verdict);
      assert.equal(rejected.ok, true);
      if (!rejected.ok) continue;
      const retry = appendExecutionDecision(rejected.content, decision, 'P1', '2026-10-27');
      assert.equal(retry.ok, false);
      if (!retry.ok) assert.match(retry.detail, /do not apply this rejected choice/);
    }
  });

  it('preserves CRLF and ignores an example ID inside a closed fence', () => {
    const input = ticket
      .replace(
        '<!--/SECTION:DECISION_LOG-->',
        '```md\nDEM-DL-1 example [verdict: accepted]\n```\n<!--/SECTION:DECISION_LOG-->'
      )
      .replaceAll('\n', '\r\n');
    const result = appendExecutionDecision(input, decision, 'P1', '2026-10-26');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(parseDeviationRecords(result.content).length, 1);
    assert.equal(result.content.replace(/DEM-DL-1 2026[^\n]*\n/, ''), input);
  });

  it('rejects malformed, forged or multiline payloads without a candidate mutation', () => {
    for (const raw of [
      null,
      [],
      {},
      { ...decision, id: 'not-an-id' },
      { ...decision, what: 'a\nb' },
      { ...decision, why: '[verdict: accepted]' },
      { ...decision, where: '<!--hidden-->' },
      { ...decision, verdict: 'accepted' },
      { ...decision, evidence: ' ' },
    ]) {
      const result = appendExecutionDecision(ticket, raw, 'P1', '2026-10-26');
      assert.equal(result.ok, false, JSON.stringify(raw));
      assert.equal('content' in result, false);
    }
  });

  it('rejects duplicate, missing, hidden or already claimed canonical IDs', () => {
    const inputs = [
      ticket.replace('<!--SECTION:DECISION_LOG-->\n<!--/SECTION:DECISION_LOG-->', ''),
      `${ticket}\n<!--SECTION:DECISION_LOG-->\n<!--/SECTION:DECISION_LOG-->`,
      ticket.replace('<!--/SECTION:DECISION_LOG-->', '```md\n<!--/SECTION:DECISION_LOG-->'),
      ticket.replace(
        '<!--/SECTION:DECISION_LOG-->',
        'DEM-DL-1 ordinary entry\n<!--/SECTION:DECISION_LOG-->'
      ),
      ticket.replace(
        '<!--/SECTION:DECISION_LOG-->',
        'DEM-DL-1 ordinary\nDEM-DL-1 duplicate\n<!--/SECTION:DECISION_LOG-->'
      ),
    ];
    for (const input of inputs)
      assert.equal(appendExecutionDecision(input, decision, 'P1', '2026-10-26').ok, false);
  });

  it('rejects the reproduced Handoff-only orphan, near-ID, duplicate references and a foreign phase decision', () => {
    assert.equal(completePhase(ticket, 'P1', payload, '2026-10-26T12:00:00Z', true).ok, false);
    const initial = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    for (const refs of ['DEM-DL-10', 'DEM-DL-1, DEM-DL-1', 'not-a-decision'])
      assert.equal(
        completePhase(
          initial.content,
          'P1',
          payload.replace('[DEM-DL-1]', `[${refs}]`),
          '2026-10-26T12:00:00Z',
          true
        ).ok,
        false
      );
    assert.equal(
      completePhase(initial.content, 'P2', payload, '2026-10-26T12:00:00Z', true).ok,
      false
    );
  });

  it('surfaces an already persisted orphan mechanically and preserves the V1 read-only boundary', () => {
    const input = ticket.replace(
      '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
      `**Handoff →** ${payload}`
    );
    const issues = (content: string, flow: 'v1' | 'v2') =>
      checkTicket('specs/demo/core/core.task.DEM-work.md', content, flow).filter(
        (finding) => finding.code === 'SDD_DEVIATION_REFERENCE_INVALID'
      );
    assert.equal(issues(input, 'v2').length, 1);
    assert.equal(issues(input, 'v2')[0]?.severity, 'warn');
    assert.equal(issues(input, 'v1').length, 0);
    const repaired = appendExecutionDecision(input, decision, 'P1', '2026-10-26');
    assert.equal(repaired.ok, true);
    if (repaired.ok) assert.equal(issues(repaired.content, 'v2').length, 0);
    const done = input.replace(
      '<!--SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:META-->\n- **Task-ID:** DEM-work\n- **Status:** [x] DONE\n<!--/SECTION:META-->\n<!--SECTION:PHASES_OVERVIEW-->'
    );
    assert.equal(issues(done, 'v2')[0]?.severity, 'error');
  });

  it('rejects ordinary duplicate IDs and duplicate verdict tokens in both completion and mechanical checking', () => {
    const initial = appendExecutionDecision(ticket, decision, 'P1', '2026-10-26');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    for (const bad of [
      initial.content.replace(
        '<!--/SECTION:DECISION_LOG-->',
        'DEM-DL-1 ordinary duplicate\n<!--/SECTION:DECISION_LOG-->'
      ),
      initial.content.replace(
        '[verdict: pending-operator]',
        '[verdict: pending-operator] [verdict: accepted]'
      ),
    ]) {
      assert.equal(completePhase(bad, 'P1', payload, '2026-10-26T12:00:00Z', true).ok, false);
      const persisted = bad.replace(
        '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
        `**Handoff →** ${payload}`
      );
      assert.equal(
        checkTicket('specs/demo/core/core.task.DEM-work.md', persisted).filter(
          (f) => f.code === 'SDD_DEVIATION_REFERENCE_INVALID'
        ).length,
        1
      );
    }
  });
});
