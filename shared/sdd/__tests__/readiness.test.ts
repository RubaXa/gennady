// @file: Unit tests for the exact-match readiness check.
// @consumers: readiness
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadiness, REQUIRED_SCRIPTS } from '../readiness.ts';

/** Check `scripts` with package.json present and gennady installed unless overridden. */
function check(scripts: Record<string, string>, opts?: { pkg?: boolean; gennady?: boolean }) {
  return checkReadiness({
    packageJsonPresent: opts?.pkg ?? true,
    scripts,
    gennadyAvailable: opts?.gennady ?? true,
  });
}

const FULL = {
  typecheck: 'tsc --noEmit',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  lint: 'npm run format && npm run lint:contracts',
  'lint:contracts': 'gennady lint .',
  format: 'prettier --write .',
};

describe('REQUIRED_SCRIPTS', () => {
  it('is the exact v2 set', () => {
    assert.deepStrictEqual(
      [...REQUIRED_SCRIPTS],
      ['typecheck', 'test', 'test:coverage', 'lint', 'format']
    );
  });
});

describe('checkReadiness', () => {
  it('ready when package.json present, all required present, lint reaches gennady, gennady installed', () => {
    const r = check(FULL);
    assert.strictEqual(r.ready, true);
    assert.deepStrictEqual(r.missing, []);
    assert.strictEqual(r.lintHasGennady, true);
    assert.strictEqual(r.packageJsonPresent, true);
    assert.strictEqual(r.gennadyAvailable, true);
  });

  it('not ready when test:coverage is missing', () => {
    const r = check({ typecheck: 'x', test: 'x', lint: 'gennady lint', format: 'x' });
    assert.strictEqual(r.ready, false);
    assert.ok(r.missing.includes('test:coverage'));
  });

  it('flags lint→gennady when lint exists but no gennady in its chain', () => {
    const r = check({
      typecheck: 'x',
      test: 'x',
      'test:coverage': 'x',
      lint: 'eslint .',
      format: 'x',
    });
    assert.strictEqual(r.lintHasGennady, false);
    assert.ok(r.missing.includes('lint→gennady'));
    assert.strictEqual(r.ready, false);
  });

  it('exact names only — `type-check` (hyphen) does NOT satisfy `typecheck`', () => {
    const r = check({
      'type-check': 'tsc --noEmit',
      test: 'x',
      'test:coverage': 'x',
      lint: 'gennady',
      format: 'x',
    });
    assert.ok(r.missing.includes('typecheck'));
  });

  it('detects gennady directly in the lint body', () => {
    assert.strictEqual(check({ lint: 'tsc && gennady lint .' }).lintHasGennady, true);
  });

  it('not ready when package.json is absent — lists package.json in missing', () => {
    const r = check({}, { pkg: false });
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.packageJsonPresent, false);
    assert.ok(r.missing.includes('package.json'));
  });

  it('not ready when gennady is not installed, even with every script wired', () => {
    const r = check(FULL, { gennady: false });
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.gennadyAvailable, false);
    assert.ok(r.missing.includes('gennady (not installed)'));
    // the scripts themselves are fine — only the install is missing
    assert.strictEqual(r.lintHasGennady, true);
    assert.ok(
      !r.missing.some((m) => REQUIRED_SCRIPTS.includes(m as (typeof REQUIRED_SCRIPTS)[number]))
    );
  });
});
