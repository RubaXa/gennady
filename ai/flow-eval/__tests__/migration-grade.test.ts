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

  it('baseline-diff: a STRUCTURAL code that only shrank vs baseline is not introduced', () => {
    // SDD_BROKEN_SPEC_REF is structural, not executability — baseline-diffed on purpose (pre-existing
    // v1 broken refs are content debt, not this migration's job). Contrast with the executability
    // (SDD_VERIFICATION_TABLE_INVALID/SDD_COVERAGE_POLICY_INVALID) case below, which the V-BATCH-22
    // fix (B-2) grades on what REMAINS instead.
    const baseline = { SDD_BROKEN_SPEC_REF: 7 };
    const g = computeMigrationGrade(
      baseline,
      'FLOW_VERSION=v2',
      findings('error', 'SDD_BROKEN_SPEC_REF', 3)
    );
    assert.deepEqual(g.introduced, []);
    assert.equal(g.pass, true);
  });
});

describe('E-07 (batch 22, red-first per L-15): SDD_VERIFICATION_TABLE_INVALID / SDD_COVERAGE_POLICY_INVALID are migration-critical', () => {
  // Frozen, REALLY-CAPTURED `sdd-check --task` output — not synthesized — from a ticket that already
  // carries every v2 SECTION anchor (as `sdd-migrate anchors` produces today) but whose Verification
  // table is still the v1 2-column shape (`| Command | Required by |`, no `Role`, no
  // `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1` markers) — exactly the migrator-completeness gap E-06
  // closes (docs/journal/flow-verification-ledger.md finding A7). Captured via
  // `gennady sdd-check --task core.task.DEMO-1.md` against a hand-built fixture with this exact shape;
  // reproducible with the same fixture at any time, not dependent on live state.
  const FROZEN_2COL_TABLE_OUTPUT =
    'core.task.DEMO-1.md:66: error: SDD_VERIFICATION_TABLE_INVALID  Verification table line 1: expected header Command | Required by | Role';

  // Frozen, REALLY-CAPTURED output from a ticket that DOES carry the v2 3-column table AND the
  // `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1` markers (schema-aware), but a migrator that copies the
  // `Coverage Policy: required` field forward mechanically without also assigning a real coverage row
  // and owner phase — the same family of defect, one step later in the migration.
  const FROZEN_COVERAGE_POLICY_OUTPUT =
    'core.task.DEMO-2.md:66: error: SDD_COVERAGE_POLICY_INVALID  required coverage needs exactly one table row with Role=coverage (found 0); required coverage needs exactly one Coverage Owner Phase (`P<N>`)';

  it('RED — on the un-migrated (anchors-only) corpus, the bar fails BEFORE the migrator gains table-upgrade capability (E-06)', () => {
    const g = computeMigrationGrade({}, 'FLOW_VERSION=v2', FROZEN_2COL_TABLE_OUTPUT);
    assert.equal(g.pass, false);
    assert.equal(g.introduced[0]?.code, 'SDD_VERIFICATION_TABLE_INVALID');
    assert.match(g.detail, /executability-remaining: SDD_VERIFICATION_TABLE_INVALID×1/);
    assert.equal(g.executabilityRemaining[0]?.code, 'SDD_VERIFICATION_TABLE_INVALID');
  });

  it('RED — a migrator that half-applies the coverage schema (marker present, fields wrong) also fails the bar', () => {
    const g = computeMigrationGrade({}, 'FLOW_VERSION=v2', FROZEN_COVERAGE_POLICY_OUTPUT);
    assert.equal(g.pass, false);
    assert.equal(g.introduced[0]?.code, 'SDD_COVERAGE_POLICY_INVALID');
  });

  it('GREEN would follow once the migrator upgrades the table (not this task — proves the bar is not a tautology)', () => {
    // Frozen "after" shape: `sdd-check` on the SAME ticket, its table upgraded to 3-column with a real
    // coverage row (the transformation E-06 adds) — 0 findings for either code.
    const g = computeMigrationGrade({}, 'FLOW_VERSION=v2', '[sdd-check] 0 error(s), 0 warning(s)');
    assert.equal(g.pass, true);
    assert.deepEqual(g.introduced, []);
  });

  // V-BATCH-22 verdict B-2 (the fix this both-way pair proves): baseline-diffing the executability
  // codes let a migration that fixes NOTHING pass, as long as the count never rose above what the
  // v1 repo already had. On E-14 (full self-migration) that means "0 tables upgraded" would still be
  // `pass:true`. Executability is graded on what REMAINS, not on the delta.
  it('RED (fixed by B-2) — pre-existing (baseline) occurrences of either code are NOT backlog: unfixed means unusable', () => {
    const baseline = { SDD_VERIFICATION_TABLE_INVALID: 2, SDD_COVERAGE_POLICY_INVALID: 1 };
    const g = computeMigrationGrade(
      baseline,
      'FLOW_VERSION=v2',
      [
        findings('error', 'SDD_VERIFICATION_TABLE_INVALID', 2),
        findings('error', 'SDD_COVERAGE_POLICY_INVALID', 1),
      ].join('\n')
    );
    assert.deepEqual(g.introduced, []); // not NEW vs baseline...
    assert.equal(g.pass, false); // ...but still fails: executability isn't baseline-relative.
    assert.deepEqual(g.executabilityRemaining.map((i) => i.code).sort(), [
      'SDD_COVERAGE_POLICY_INVALID',
      'SDD_VERIFICATION_TABLE_INVALID',
    ]);
  });

  it('GREEN counterpart — the same baseline, but `after` is truly clean of both codes → PASS', () => {
    const baseline = { SDD_VERIFICATION_TABLE_INVALID: 2, SDD_COVERAGE_POLICY_INVALID: 1 };
    const g = computeMigrationGrade(
      baseline,
      'FLOW_VERSION=v2',
      '[sdd-check] 0 error(s), 0 warning(s)'
    );
    assert.equal(g.pass, true);
    assert.deepEqual(g.executabilityRemaining, []);
  });

  it('a SHRUNK-but-nonzero executability count still fails — partial fixes are not fixes', () => {
    const baseline = { SDD_VERIFICATION_TABLE_INVALID: 7 };
    const g = computeMigrationGrade(
      baseline,
      'FLOW_VERSION=v2',
      findings('error', 'SDD_VERIFICATION_TABLE_INVALID', 3)
    );
    assert.deepEqual(g.introduced, []); // count fell 7 → 3, so not "introduced"...
    assert.equal(g.pass, false); // ...but 3 tickets are still not sdd-task-executable.
  });
});
