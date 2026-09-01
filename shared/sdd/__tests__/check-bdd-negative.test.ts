// @file: Unit tests for checkBddNegativeScenario (SDD_BDD_MISSING_NEGATIVE) and its wiring into checkTicket.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkBddNegativeScenario, checkTicket } from '../check.ts';

const HAPPY_ONLY = [
  '**Feature:** does something',
  '',
  '**Scenario:** happy path [`unit`] `[GAT-REQ-1]`',
  '- **Given** valid input',
  '- **When** the command runs',
  '- **Then** it succeeds',
  '',
].join('\n');

const WITH_NEGATIVE = [
  HAPPY_ONLY,
  '**Scenario:** rejects invalid input [`unit`] `[GAT-REQ-2]`',
  '- **Given** invalid input',
  '- **When** the command runs',
  '- **Then** it returns an error',
  '',
].join('\n');

describe('checkBddNegativeScenario', () => {
  it('happy-path-only scenarios, ticket TODO → error during authoring', () => {
    const findings = checkBddNegativeScenario('t.md', HAPPY_ONLY, false);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_MISSING_NEGATIVE');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('happy-path-only scenarios, ticket DONE → error', () => {
    const findings = checkBddNegativeScenario('t.md', HAPPY_ONLY, true);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('at least one negative-marker scenario present → no finding', () => {
    assert.deepStrictEqual(checkBddNegativeScenario('t.md', WITH_NEGATIVE, false), []);
    assert.deepStrictEqual(checkBddNegativeScenario('t.md', WITH_NEGATIVE, true), []);
  });

  it('English failure marker (e.g. "error") also counts as negative', () => {
    const body = [
      HAPPY_ONLY,
      '**Scenario:** times out [`unit`] `[GAT-REQ-3]`',
      '- **Given** a slow dependency',
      '- **When** the command runs',
      '- **Then** it returns a timeout error',
      '',
    ].join('\n');
    assert.deepStrictEqual(checkBddNegativeScenario('t.md', body, false), []);
  });

  it('empty BDD body (no scenario at all) → still flagged', () => {
    const findings = checkBddNegativeScenario('t.md', '**Feature:** nothing yet\n', false);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_BDD_MISSING_NEGATIVE');
  });
});

const ticket = (opts: { status: string; bdd?: string }): string => {
  const parts = [
    '<!--SECTION:META-->',
    '- **Task-ID:** GAT-login',
    `- **Status:** ${opts.status}`,
    '<!--/SECTION:META-->',
    '',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '<!--/SECTION:EXECUTION_LOG-->',
  ];
  if (opts.bdd !== undefined) {
    parts.push(
      '',
      '<!--SECTION:BDD-->',
      '## Acceptance Criteria (BDD)',
      '',
      opts.bdd,
      '<!--/SECTION:BDD-->'
    );
  }
  return parts.join('\n');
};

describe('checkTicket integration — SDD_BDD_MISSING_NEGATIVE', () => {
  it('ticket with no BDD section at all → not flagged by this rule', () => {
    const findings = checkTicket('t.md', ticket({ status: '[ ] TODO' }));
    assert.ok(!findings.some((f) => f.code === 'SDD_BDD_MISSING_NEGATIVE'));
  });

  it('TODO ticket, happy-path-only BDD → error finding present', () => {
    const findings = checkTicket('t.md', ticket({ status: '[ ] TODO', bdd: HAPPY_ONLY }));
    const finding = findings.find((f) => f.code === 'SDD_BDD_MISSING_NEGATIVE');
    assert.ok(finding, 'expected SDD_BDD_MISSING_NEGATIVE');
    assert.strictEqual(finding?.severity, 'error');
  });

  it('DONE ticket, happy-path-only BDD → error finding present', () => {
    const findings = checkTicket('t.md', ticket({ status: '[x] DONE', bdd: HAPPY_ONLY }));
    const finding = findings.find((f) => f.code === 'SDD_BDD_MISSING_NEGATIVE');
    assert.ok(finding, 'expected SDD_BDD_MISSING_NEGATIVE');
    assert.strictEqual(finding?.severity, 'error');
  });

  it('DONE ticket with a negative scenario → no such finding', () => {
    const findings = checkTicket('t.md', ticket({ status: '[x] DONE', bdd: WITH_NEGATIVE }));
    assert.ok(!findings.some((f) => f.code === 'SDD_BDD_MISSING_NEGATIVE'));
  });
});
