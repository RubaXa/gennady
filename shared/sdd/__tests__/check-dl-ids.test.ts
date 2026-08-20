// @file: Unit tests for checkDecisionLogIds — <ACR>-DL-<N> grammar/uniqueness + legacy D-NNN migration hint.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDecisionLogIds } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md'; // deriveSpecAcronym → "IC"

const spec = (decisionLogBody: string): string =>
  [
    '<!--SECTION:DECISION_LOG-->',
    '## Decision Log',
    '',
    decisionLogBody,
    '<!--/SECTION:DECISION_LOG-->',
  ].join('\n');

describe('checkDecisionLogIds', () => {
  it('no DECISION_LOG section at all → no findings', () => {
    assert.deepStrictEqual(checkDecisionLogIds(SPEC_FILE, 'no sections here'), []);
  });

  it('legacy D-NNN heading entries → one warn, no errors', () => {
    const content = spec(
      ['### D-001 — some old decision', '', '- **Status:** active', '- **Why:** reasons', ''].join(
        '\n'
      )
    );
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DL_LEGACY_ID');
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.match(findings[0]?.message ?? '', /IC-DL-1/);
  });

  it('legacy D-NNN table rows → one warn', () => {
    const content = spec(
      [
        '| ID | Status | Original decision |',
        '|---|---|---|',
        '| D-301 | active | something |',
        '',
      ].join('\n')
    );
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DL_LEGACY_ID');
  });

  it('clean new-format entries → no findings', () => {
    const content = spec(
      [
        'IC-DL-1 2026-08-20 — first decision (почему: reason)',
        'IC-DL-2 2026-08-20 — second decision (почему: reason)',
        '',
      ].join('\n')
    );
    assert.deepStrictEqual(checkDecisionLogIds(SPEC_FILE, content), []);
  });

  it('flags a grammar-invalid new-shaped candidate (lowercase acronym)', () => {
    const content = spec('ic-dl-1 2026-08-20 — a decision (почему: reason)\n');
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DL_ID_GRAMMAR');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('flags a duplicate number within one spec', () => {
    const content = spec(
      [
        'IC-DL-1 2026-08-20 — first (почему: a)',
        'IC-DL-1 2026-08-20 — duplicate (почему: b)',
        '',
      ].join('\n')
    );
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    const collision = findings.find((f) => f.code === 'SDD_DL_ID_COLLISION');
    assert.ok(collision, 'expected SDD_DL_ID_COLLISION');
    assert.strictEqual(collision?.severity, 'error');
  });

  it('flags an acronym mismatch against the spec-derived acronym', () => {
    const content = spec('XYZ-DL-1 2026-08-20 — a decision (почему: reason)\n');
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DL_ACRONYM_MISMATCH');
    assert.match(findings[0]?.message ?? '', /XYZ/);
    assert.match(findings[0]?.message ?? '', /IC/);
  });

  it('mixed legacy + valid new entries → warn for legacy only, no error for the new one', () => {
    const content = spec(
      [
        '### D-001 — old decision',
        '- **Status:** active',
        '',
        'IC-DL-1 2026-08-20 — new decision (почему: reason)',
        '',
      ].join('\n')
    );
    const findings = checkDecisionLogIds(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DL_LEGACY_ID');
  });
});
