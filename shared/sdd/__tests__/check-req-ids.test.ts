// @file: Unit tests for checkRequirementIds — <ACR>-REQ-<N> grammar, uniqueness, acronym match.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequirementIds } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md'; // deriveSpecAcronym → "IC"

const spec = (requirementsBody: string, sectionName = 'REQUIREMENTS_AND_CONSTRAINTS'): string =>
  [
    `<!--SECTION:${sectionName}-->`,
    '## Requirements & Constraints',
    '',
    '### Requirements',
    '',
    requirementsBody,
    `<!--/SECTION:${sectionName}-->`,
  ].join('\n');

const entry = (id: string, classTag: string, body = 'x'): string =>
  [
    `### ${id} [${classTag}]`,
    '',
    `**Когда** ${body}, **сервис должен** сделать X.`,
    '',
    '> потому что.',
    '',
  ].join('\n');

describe('checkRequirementIds', () => {
  it('clean requirements → no findings', () => {
    const content = spec(entry('IC-REQ-1', 'должен') + entry('IC-REQ-2', 'должен · нештатная'));
    assert.deepStrictEqual(checkRequirementIds(SPEC_FILE, content), []);
  });

  it('flags a grammar-invalid id (lowercase acronym)', () => {
    const content = spec(entry('ic-req-1', 'должен'));
    const findings = checkRequirementIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_REQ_ID_GRAMMAR');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /IC-REQ-1/);
  });

  it('flags a duplicate number within one spec', () => {
    const content = spec(entry('IC-REQ-1', 'должен') + entry('IC-REQ-1', 'должен'));
    const findings = checkRequirementIds(SPEC_FILE, content);
    const collision = findings.find((f) => f.code === 'SDD_REQ_ID_COLLISION');
    assert.ok(collision, 'expected SDD_REQ_ID_COLLISION');
    assert.strictEqual(collision?.severity, 'error');
    assert.match(collision?.message ?? '', /IC-REQ-1/);
  });

  it('flags an acronym mismatch against the spec-derived acronym', () => {
    const content = spec(entry('XYZ-REQ-1', 'должен'));
    const findings = checkRequirementIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_REQ_ACRONYM_MISMATCH');
    assert.match(findings[0]?.message ?? '', /XYZ/);
    assert.match(findings[0]?.message ?? '', /IC/);
  });

  it('normalizes leading-zero numbers before comparing for duplicates', () => {
    const content = spec(entry('IC-REQ-01', 'должен') + entry('IC-REQ-1', 'должен'));
    const findings = checkRequirementIds(SPEC_FILE, content);
    assert.ok(findings.some((f) => f.code === 'SDD_REQ_ID_COLLISION'));
  });

  it('no Requirements/Module-Requirements section at all → no findings', () => {
    const content = ['<!--SECTION:OVERVIEW-->', 'nothing here', '<!--/SECTION:OVERVIEW-->'].join(
      '\n'
    );
    assert.deepStrictEqual(checkRequirementIds(SPEC_FILE, content), []);
  });

  it('old split Functional/Non-Functional format → no findings (no bracketed headings)', () => {
    const content = spec(
      [
        '### Functional Requirements',
        '',
        '| ID | Description |',
        '|---|---|',
        '| FR-01 | Something |',
        '',
      ].join('\n')
    );
    assert.deepStrictEqual(checkRequirementIds(SPEC_FILE, content), []);
  });

  it('works through MODULE_REQUIREMENTS for a module spec', () => {
    const content = spec(entry('IC-REQ-1', 'должен'), 'MODULE_REQUIREMENTS');
    assert.deepStrictEqual(checkRequirementIds(SPEC_FILE, content), []);
  });
});
