// @file: Deterministic-grade unit tests for the migration phase (histogram + pure baseline-diff grade).
// @consumers: migration-grade
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFindingHistogram, computeMigrationGrade } from '../migration-grade.ts';

/** @purpose Build a fake sdd-check output with `n` findings of one code+severity. */
function findings(severity: 'error' | 'warn', code: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `specs/x.md:${i}: ${severity}: ${code}  ...`).join(
    '\n'
  );
}

describe('migration-grade (histogram + deterministic baseline-diff grade)', () => {
  it('parseFindingHistogram counts each code across errors and warnings', () => {
    const out = [
      findings('error', 'SDD_DEP_UNRESOLVED', 2),
      findings('warn', 'SDD_LANGUAGE_CALQUE', 3),
    ].join('\n');
    assert.deepEqual(parseFindingHistogram(out), {
      SDD_DEP_UNRESOLVED: 2,
      SDD_LANGUAGE_CALQUE: 3,
    });
  });

  it('v2 + only pre-existing findings (unchanged vs baseline) → PASS, nothing introduced', () => {
    const baseline = { SDD_DEP_UNRESOLVED: 9, SDD_LANGUAGE_CALQUE: 32 };
    const check = [
      findings('error', 'SDD_DEP_UNRESOLVED', 9),
      findings('warn', 'SDD_LANGUAGE_CALQUE', 32),
    ].join('\n');
    const g = computeMigrationGrade(baseline, 'FLOW_VERSION=v2\nPORTAL=present', check);
    assert.equal(g.flowV2, true);
    assert.deepEqual(g.introduced, []);
    assert.equal(g.pass, true);
  });

  it('a NEW critical structural finding (broken spec ref) fails the migration', () => {
    const g = computeMigrationGrade(
      {},
      'FLOW_VERSION=v2',
      findings('error', 'SDD_BROKEN_SPEC_REF', 1)
    );
    assert.equal(g.pass, false);
    assert.equal(g.introduced[0]?.code, 'SDD_BROKEN_SPEC_REF');
  });

  it('a NEW content-debt error (not structural) is backlog, not a failure', () => {
    // SDD_DEP_UNRESOLVED is content/authoring debt exposed by strict v2, not a migration integrity break.
    const g = computeMigrationGrade(
      {},
      'FLOW_VERSION=v2',
      findings('error', 'SDD_DEP_UNRESOLVED', 3)
    );
    assert.equal(g.pass, true);
    assert.match(g.detail, /backlog: SDD_DEP_UNRESOLVED\+3/);
  });

  it('a NEW warning + v2 → PASS — warnings are backlog', () => {
    const g = computeMigrationGrade(
      {},
      'FLOW_VERSION=v2',
      findings('warn', 'SDD_LANGUAGE_CALQUE', 5)
    );
    assert.equal(g.pass, true);
    assert.equal(g.introduced.length, 1);
  });

  it('not v2 → FAIL even with zero new findings', () => {
    const g = computeMigrationGrade({}, 'FLOW_VERSION=v1', '');
    assert.equal(g.flowV2, false);
    assert.equal(g.pass, false);
  });

  it('baseline-diff: a code that only shrank vs baseline is not introduced', () => {
    const baseline = { SDD_VERIFICATION_TABLE_INVALID: 7 };
    const g = computeMigrationGrade(
      baseline,
      'FLOW_VERSION=v2',
      findings('error', 'SDD_VERIFICATION_TABLE_INVALID', 3)
    );
    assert.deepEqual(g.introduced, []);
    assert.equal(g.pass, true);
  });
});
