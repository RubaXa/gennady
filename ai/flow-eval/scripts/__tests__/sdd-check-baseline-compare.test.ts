// @file: Fixture-based proof for the GAP-B-1 zero-new-error compare (sdd-check-baseline-compare.ts) —
//   the three acceptance scenarios from Бриф 0/5: identical findings exit clean, one new error is
//   named and fails, one new warning never fails.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countsByCode,
  dedupeSortFindings,
  toBaselineFindings,
  zeroNewErrorVerdict,
  type BaselineFinding,
  type SddCheckBaseline,
} from '../sdd-check-baseline-compare.ts';

function fixtureBaseline(findings: readonly BaselineFinding[]): Pick<SddCheckBaseline, 'findings'> {
  return { findings };
}

const KNOWN_ERROR: BaselineFinding = {
  code: 'SDD_MODULE_DAG_CYCLE',
  file: 'specs/agent-inbox/agent-inbox.spec.md',
  severity: 'error',
};
const KNOWN_WARNING: BaselineFinding = {
  code: 'SDD_DL_LEGACY_ID',
  file: 'specs/agent-inbox/agent-inbox.spec.md',
  severity: 'warn',
};

describe('zeroNewErrorVerdict', () => {
  it('identical findings against the baseline pass (ok: true)', () => {
    const baseline = fixtureBaseline([KNOWN_ERROR, KNOWN_WARNING]);
    const fresh: BaselineFinding[] = [KNOWN_ERROR, KNOWN_WARNING];
    assert.deepEqual(zeroNewErrorVerdict(baseline, fresh), { ok: true });
  });

  it('one new error not in the baseline fails and names it', () => {
    const baseline = fixtureBaseline([KNOWN_ERROR, KNOWN_WARNING]);
    const newError: BaselineFinding = {
      code: 'SDD_DIAGRAM_INVALID',
      file: 'tasks/README.md',
      severity: 'error',
    };
    const fresh: BaselineFinding[] = [KNOWN_ERROR, KNOWN_WARNING, newError];
    const verdict = zeroNewErrorVerdict(baseline, fresh);
    assert.equal(verdict.ok, false);
    if (verdict.ok) throw new Error('unreachable');
    assert.deepEqual(verdict.newErrors, [{ code: 'SDD_DIAGRAM_INVALID', file: 'tasks/README.md' }]);
  });

  it('one new warning not in the baseline never fails the gate', () => {
    const baseline = fixtureBaseline([KNOWN_ERROR, KNOWN_WARNING]);
    const newWarning: BaselineFinding = {
      code: 'SDD_RESEARCH_UNREGISTERED',
      file: 'specs/ai-skills/research/new-doc.research.md',
      severity: 'warn',
    };
    const fresh: BaselineFinding[] = [KNOWN_ERROR, KNOWN_WARNING, newWarning];
    assert.deepEqual(zeroNewErrorVerdict(baseline, fresh), { ok: true });
  });

  it('a baseline error missing from the fresh run (fixed) still passes — the gate only flags NEW errors', () => {
    const baseline = fixtureBaseline([KNOWN_ERROR, KNOWN_WARNING]);
    const fresh: BaselineFinding[] = [KNOWN_WARNING];
    assert.deepEqual(zeroNewErrorVerdict(baseline, fresh), { ok: true });
  });

  it('the same (code, file) pair repeated at different lines is one baseline entry, not several', () => {
    const baseline = fixtureBaseline([KNOWN_ERROR]);
    // Two fresh findings share (code, file) — sdd-check --format json can report the same
    // finding at more than one line; the gate keys on (code, file) only, so both are "known".
    const fresh: BaselineFinding[] = [KNOWN_ERROR, KNOWN_ERROR];
    assert.deepEqual(zeroNewErrorVerdict(baseline, fresh), { ok: true });
  });

  it('multiple distinct new errors are all named, sorted by code then file', () => {
    const baseline = fixtureBaseline([]);
    const fresh: BaselineFinding[] = [
      { code: 'SDD_B_CODE', file: 'z.md', severity: 'error' },
      { code: 'SDD_A_CODE', file: 'y.md', severity: 'error' },
      { code: 'SDD_A_CODE', file: 'x.md', severity: 'error' },
    ];
    const verdict = zeroNewErrorVerdict(baseline, fresh);
    assert.equal(verdict.ok, false);
    if (verdict.ok) throw new Error('unreachable');
    assert.deepEqual(verdict.newErrors, [
      { code: 'SDD_A_CODE', file: 'x.md' },
      { code: 'SDD_A_CODE', file: 'y.md' },
      { code: 'SDD_B_CODE', file: 'z.md' },
    ]);
  });
});

describe('toBaselineFindings', () => {
  it('maps raw sdd-check severities to the two-value SddCheckSeverity ("warn", not "warning")', () => {
    const mapped = toBaselineFindings([
      { code: 'SDD_A', file: 'a.md', severity: 'error' },
      { code: 'SDD_B', file: 'b.md', severity: 'warn' },
    ]);
    assert.deepEqual(mapped, [
      { code: 'SDD_A', file: 'a.md', severity: 'error' },
      { code: 'SDD_B', file: 'b.md', severity: 'warn' },
    ]);
  });
});

describe('dedupeSortFindings', () => {
  it('deduplicates by (code, file, severity) and sorts deterministically', () => {
    const result = dedupeSortFindings([
      { code: 'SDD_B', file: 'b.md', severity: 'error' },
      { code: 'SDD_A', file: 'b.md', severity: 'warn' },
      { code: 'SDD_A', file: 'a.md', severity: 'error' },
      { code: 'SDD_A', file: 'a.md', severity: 'error' }, // exact duplicate, collapses
    ]);
    assert.deepEqual(result, [
      { code: 'SDD_A', file: 'a.md', severity: 'error' },
      { code: 'SDD_A', file: 'b.md', severity: 'warn' },
      { code: 'SDD_B', file: 'b.md', severity: 'error' },
    ]);
  });
});

describe('countsByCode', () => {
  it('counts error/warn per code from the RAW findings, not the deduplicated set', () => {
    const result = countsByCode([
      { code: 'SDD_A', file: 'a.md', severity: 'error' },
      { code: 'SDD_A', file: 'a.md', severity: 'error' }, // same (code,file) twice — both counted
      { code: 'SDD_A', file: 'b.md', severity: 'warn' },
      { code: 'SDD_B', file: 'c.md', severity: 'error' },
    ]);
    assert.deepEqual(result, {
      SDD_A: { error: 2, warn: 1 },
      SDD_B: { error: 1, warn: 0 },
    });
  });
});
