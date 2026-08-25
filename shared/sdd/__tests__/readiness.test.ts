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
  'type-check': 'tsc --noEmit',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  lint: 'npm run format && npm run lint:contracts',
  'lint:contracts': 'gennady lint .',
  format: 'prettier --check .',
  check: 'npm run type-check && npm test && npm run lint && npm run format',
  fix: 'npm run format:fix && npm run lint:fix && npm run check',
  'format:fix': 'prettier --write .',
  'lint:fix': 'eslint --fix .',
};

describe('REQUIRED_SCRIPTS', () => {
  it('is the exact v2 set — seven bricks sdd-verify composes; `check`/`fix` are wrappers, not bricks', () => {
    assert.deepStrictEqual(
      [...REQUIRED_SCRIPTS],
      ['type-check', 'test', 'test:coverage', 'format', 'format:fix', 'lint', 'lint:fix']
    );
    assert.ok(!REQUIRED_SCRIPTS.includes('check' as (typeof REQUIRED_SCRIPTS)[number]));
    assert.ok(!REQUIRED_SCRIPTS.includes('fix' as (typeof REQUIRED_SCRIPTS)[number]));
  });

  it('rejects a format script that itself writes (prettier --write)', () => {
    const r = check({ ...FULL, format: 'prettier --write .' });
    assert.strictEqual(r.formatReadOnly, false);
    assert.ok(r.missing.includes('format(read-only)'));
    assert.strictEqual(r.ready, false);
  });

  it('rejects a lint script that transitively reaches a write-mode sibling (format:fix)', () => {
    const r = check({ ...FULL, lint: 'npm run format:fix && npm run lint:contracts' });
    assert.strictEqual(r.lintReadOnly, false);
    assert.ok(r.missing.includes('lint(read-only)'));
    assert.strictEqual(r.ready, false);
  });

  it("rejects gennady's own write switch: lint reaching `--autofix` is not read-only", () => {
    const r = check({ ...FULL, lint: 'gennady lint --autofix .' });
    assert.strictEqual(r.lintReadOnly, false);
    assert.ok(r.missing.includes('lint(read-only)'));
    assert.strictEqual(r.ready, false);
  });

  it('still applies the read-only check to a homemade `check` script even though it is no longer required', () => {
    const r = check({ ...FULL, check: 'npm run lint:fix && npm run type-check' });
    assert.strictEqual(r.checkReadOnly, false);
    assert.ok(r.missing.includes('check(read-only)'));
    assert.strictEqual(r.ready, false);
  });

  it('stays ready with `check`/`fix` entirely absent — they are wrappers, not required bricks', () => {
    const withoutWrappers = Object.fromEntries(
      Object.entries(FULL).filter(([name]) => name !== 'check' && name !== 'fix')
    );
    const r = checkReadiness({
      packageJsonPresent: true,
      scripts: withoutWrappers,
      gennadyAvailable: true,
    });
    assert.strictEqual(r.ready, true);
    assert.deepStrictEqual(r.missing, []);
  });

  it('rejects a format:fix that never mutates (missing --write/--fix/--autofix)', () => {
    const r = check({ ...FULL, 'format:fix': 'prettier --check .' });
    assert.strictEqual(r.formatFixMutates, false);
    assert.ok(
      r.missing.includes('format:fix(no --write/--fix/--autofix — a fixer that never mutates)')
    );
    assert.strictEqual(r.ready, false);
  });

  it('rejects a lint:fix that never mutates (missing --write/--fix/--autofix)', () => {
    const r = check({ ...FULL, 'lint:fix': 'eslint .' });
    assert.strictEqual(r.lintFixMutates, false);
    assert.ok(
      r.missing.includes('lint:fix(no --write/--fix/--autofix — a fixer that never mutates)')
    );
    assert.strictEqual(r.ready, false);
  });

  it("accepts gennady's own `--autofix` as the mutating switch for lint:fix", () => {
    const r = check({ ...FULL, 'lint:fix': 'gennady lint --autofix .' });
    assert.strictEqual(r.lintFixMutates, true);
    assert.strictEqual(r.ready, true);
  });

  it('a lint:fix that only reaches its mutating sibling transitively still counts as mutating', () => {
    const r = check({
      ...FULL,
      'lint:fix': 'npm run lint:fix:inner',
      'lint:fix:inner': 'eslint --fix .',
    });
    assert.strictEqual(r.lintFixMutates, true);
    assert.strictEqual(r.ready, true);
  });
});

describe('checkReadiness', () => {
  it('ready when package.json present, all required present, lint reaches gennady, gennady installed', () => {
    const r = check(FULL);
    assert.strictEqual(r.ready, true);
    assert.deepStrictEqual(r.missing, []);
    assert.strictEqual(r.lintHasGennady, true);
    assert.strictEqual(r.formatReadOnly, true);
    assert.strictEqual(r.lintReadOnly, true);
    assert.strictEqual(r.checkReadOnly, true);
    assert.strictEqual(r.formatFixMutates, true);
    assert.strictEqual(r.lintFixMutates, true);
    assert.strictEqual(r.packageJsonPresent, true);
    assert.strictEqual(r.gennadyAvailable, true);
  });

  it('npm-init placeholder test script counts as absent, not present', () => {
    const r = check({ ...FULL, test: 'echo "Error: no test specified" && exit 1' });
    assert.strictEqual(r.ready, false);
    assert.ok(r.missing.includes('test'));
  });

  it('empty-body script counts as absent', () => {
    const r = check({ ...FULL, test: '   ' });
    assert.strictEqual(r.ready, false);
    assert.ok(r.missing.includes('test'));
  });

  it('not ready when test:coverage is missing', () => {
    const r = check({ 'type-check': 'x', test: 'x', lint: 'gennady lint', format: 'x' });
    assert.strictEqual(r.ready, false);
    assert.ok(r.missing.includes('test:coverage'));
  });

  it('flags lint→gennady when lint exists but no gennady in its chain', () => {
    const r = check({
      'type-check': 'x',
      test: 'x',
      'test:coverage': 'x',
      lint: 'eslint .',
      format: 'x',
    });
    assert.strictEqual(r.lintHasGennady, false);
    assert.ok(r.missing.includes('lint→gennady'));
    assert.strictEqual(r.ready, false);
  });

  it('accepts the `typecheck` spelling as an alias for the required `type-check` script', () => {
    const r = check({
      typecheck: 'tsc --noEmit',
      test: 'x',
      'test:coverage': 'x',
      lint: 'gennady',
      format: 'x',
    });
    assert.ok(!r.missing.includes('type-check'));
    assert.strictEqual(r.required.find((s) => s.name === 'type-check')?.present, true);
  });

  it('neither spelling present → missing lists the canonical `type-check` name', () => {
    const r = check({ test: 'x', 'test:coverage': 'x', lint: 'gennady', format: 'x' });
    assert.ok(r.missing.includes('type-check'));
    assert.ok(!r.missing.includes('typecheck'));
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

  it('ready without a `yagni` npm script — sdd-verify runs yagni via `npx gennady yagni` directly, never `npm run yagni`, so no project script is required for readiness/sdd-verify consistency', () => {
    const r = check(FULL);
    assert.strictEqual('yagni' in FULL, false);
    assert.strictEqual(r.ready, true);
    assert.ok(!r.missing.includes('yagni'));
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
