// @file: Unit tests for checkRequirementUnhappyPath — the "· нештатная" completeness gate.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequirementUnhappyPath } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md';

const spec = (requirementsBody: string): string =>
  [
    '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    '## Requirements & Constraints',
    '',
    '### Requirements',
    '',
    requirementsBody,
    '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
  ].join('\n');

describe('checkRequirementUnhappyPath', () => {
  it('happy trigger present, no нештатная entry → error', () => {
    const content = spec(
      ['### IC-REQ-1 [должен]', '**Когда** X, **сервис должен** Y.', '', '> because.', ''].join(
        '\n'
      )
    );
    const findings = checkRequirementUnhappyPath(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_REQ_MISSING_UNHAPPY');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('happy trigger + нештатная entry → no finding', () => {
    const content = spec(
      [
        '### IC-REQ-1 [должен]',
        '**Когда** X, **сервис должен** Y.',
        '',
        '> because.',
        '',
        '### IC-REQ-2 [должен · нештатная]',
        '**Если** X не удался, **то сервис должен** отклонить операцию.',
        '',
        '> because.',
        '',
      ].join('\n')
    );
    assert.deepStrictEqual(checkRequirementUnhappyPath(SPEC_FILE, content), []);
  });

  it('no happy trigger at all (unconditional requirement only) → no finding', () => {
    const content = spec(
      ['### IC-REQ-1 [должен]', '**Сервис должен** делать X.', '', '> because.', ''].join('\n')
    );
    assert.deepStrictEqual(checkRequirementUnhappyPath(SPEC_FILE, content), []);
  });

  it('Пока trigger alone, no нештатная → error', () => {
    const content = spec(
      [
        '### IC-REQ-1 [должен]',
        '**Пока** X держится, **сервис должен** Y.',
        '',
        '> because.',
        '',
      ].join('\n')
    );
    const findings = checkRequirementUnhappyPath(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_REQ_MISSING_UNHAPPY');
  });

  it('При trigger alone, no нештатная → error', () => {
    const content = spec(
      [
        '### IC-REQ-1 [должен]',
        '**При** X включена, **сервис должен** Y.',
        '',
        '> because.',
        '',
      ].join('\n')
    );
    const findings = checkRequirementUnhappyPath(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_REQ_MISSING_UNHAPPY');
  });

  it('old split Functional/Non-Functional format → never touched, even with "Когда" in prose', () => {
    const content = spec(
      ['### Functional Requirements', '', 'Когда пользователь делает X — таблица ниже.', ''].join(
        '\n'
      )
    );
    assert.deepStrictEqual(checkRequirementUnhappyPath(SPEC_FILE, content), []);
  });

  it('no Requirements section at all → no finding', () => {
    const content = ['<!--SECTION:OVERVIEW-->', 'nothing', '<!--/SECTION:OVERVIEW-->'].join('\n');
    assert.deepStrictEqual(checkRequirementUnhappyPath(SPEC_FILE, content), []);
  });
});
