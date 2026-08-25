// @file: Unit tests for the exact-match readiness check.
// @consumers: readiness
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkReadiness,
  isStubScript,
  isVacuousScript,
  silencesExitCode,
  REQUIRED_SCRIPTS,
} from '../readiness.ts';

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

describe('isStubScript', () => {
  it('an echo-only body (with stderr redirect) is a stub', () => {
    const scripts = { test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2" };
    assert.strictEqual(isStubScript(scripts, 'test'), true);
  });

  it('a chained echo && real-command body is NOT a stub', () => {
    const scripts = { test: 'echo running && node --test' };
    assert.strictEqual(isStubScript(scripts, 'test'), false);
  });

  it('an npm-run hop to an echo-only script is still a stub; a hop to a real one is not', () => {
    assert.strictEqual(
      isStubScript({ test: 'npm run test:inner', 'test:inner': 'echo TODO' }, 'test'),
      true
    );
    assert.strictEqual(
      isStubScript({ test: 'npm run test:inner', 'test:inner': 'node --test' }, 'test'),
      false
    );
  });

  it('an absent script is not a stub — it is simply missing', () => {
    assert.strictEqual(isStubScript({}, 'test'), false);
  });

  it('every unambiguous shell no-op counts, not just `echo`', () => {
    for (const body of ['true', ':', 'exit 0', 'node -e ""', "node -e ''", 'echo hi && true']) {
      assert.strictEqual(isStubScript({ test: body }, 'test'), true, `expected stub: ${body}`);
    }
  });

  it('a real command is not a stub, however short', () => {
    for (const body of ['tsc --noEmit', 'node --test', 'vitest run', 'node -e "runTests()"']) {
      assert.strictEqual(isStubScript({ test: body }, 'test'), false, `expected real: ${body}`);
    }
  });

  it('an echo PIPED into a real tool is not a stub — `|` separates commands like any other operator', () => {
    assert.strictEqual(
      isStubScript({ test: 'echo $npm_package_version | xargs -I{} tsc --noEmit' }, 'test'),
      false
    );
  });

  it('a multi-line body is not one command — a banner line above a real tool is not a stub', () => {
    assert.strictEqual(isStubScript({ test: 'echo "running tests"\nnode --test' }, 'test'), false);
  });
});

describe('silencesExitCode', () => {
  it('a real command with its failure swallowed is caught in every common spelling', () => {
    for (const body of [
      'tsc --noEmit || true',
      'node --test || :',
      'vitest run || exit 0',
      'tsc --noEmit; true',
      'eslint . || true && echo done',
    ]) {
      assert.strictEqual(
        silencesExitCode({ test: body }, 'test'),
        true,
        `expected silenced: ${body}`
      );
    }
  });

  it('an honest command that can fail is not flagged', () => {
    for (const body of ['tsc --noEmit', 'npm run a && npm run b', 'node --test || exit 1']) {
      assert.strictEqual(
        silencesExitCode({ test: body }, 'test'),
        false,
        `expected honest: ${body}`
      );
    }
  });

  // False positives are the dangerous direction here: they block an honest project while asserting
  // something untrue about its scripts, and nothing in the flow offers an override.
  it('a GUARDED PREP STEP followed by a real check is honest — the shell reports the real check', () => {
    for (const body of [
      'rm -rf dist || true && tsc --noEmit',
      'mkdir -p coverage || true; c8 node --test',
      'git rev-parse HEAD > .rev || true && vitest run',
    ]) {
      assert.strictEqual(
        silencesExitCode({ test: body }, 'test'),
        false,
        `expected honest (prep step guarded, real check last): ${body}`
      );
    }
  });

  it('`real && true` is honest — the tail never runs when the real command fails', () => {
    assert.strictEqual(silencesExitCode({ test: 'tsc --noEmit && true' }, 'test'), false);
  });

  // An `&&` tail is skipped when the command before it fails, so the failure still propagates.
  // Fanning a gate out to a sibling script, or echoing a success banner, is the most ordinary npm
  // idiom there is — flagging it would pin an honest project at `provisional` with no override.
  it('`set -e` makes a `;`-separated tail honest — a failed real command aborts before the no-op runs', () => {
    for (const body of [
      'set -e; tsc --noEmit; echo ok',
      'set -euo pipefail; vitest run; echo done',
      'set -o errexit; tsc --noEmit; :',
    ]) {
      assert.strictEqual(
        silencesExitCode({ test: body }, 'test'),
        false,
        `expected honest under set -e: ${body}`
      );
    }
  });

  it('`set -e` does NOT rescue an explicit `|| true` catch — that still masks', () => {
    assert.strictEqual(silencesExitCode({ test: 'set -e; tsc --noEmit || true' }, 'test'), true);
  });

  it('without `set -e`, a `;`-separated trailing no-op genuinely masks — npm sees the no-op exit code', () => {
    assert.strictEqual(silencesExitCode({ test: 'tsc --noEmit; echo done' }, 'test'), true);
  });

  it('an && chain into a sibling script or a success banner is honest, not silenced', () => {
    for (const body of [
      'tsc --noEmit -p tsconfig.json && npm run type-check:test',
      'vitest run && npm run test:e2e',
      'gennady lint src/ && echo "✓ lint clean"',
      'prettier --check . && npm run format:md',
      'eslint src/ --fix && npm run lint:fix:styles',
      'vitest run --coverage && npm run coverage:report',
    ]) {
      assert.strictEqual(
        silencesExitCode({ test: body }, 'test'),
        false,
        `expected honest (&& chain): ${body}`
      );
    }
  });

  it('a silencer reached through an npm-run hop still counts', () => {
    assert.strictEqual(
      silencesExitCode({ test: 'npm run test:inner', 'test:inner': 'tsc || true' }, 'test'),
      true
    );
  });
});

describe('isVacuousScript', () => {
  it('covers both forms — a no-op stub and a silenced real command', () => {
    assert.strictEqual(isVacuousScript({ test: 'echo TODO' }, 'test'), true);
    assert.strictEqual(isVacuousScript({ test: 'tsc --noEmit || true' }, 'test'), true);
    assert.strictEqual(isVacuousScript({ test: 'tsc --noEmit' }, 'test'), false);
  });
});

describe('readiness levels (not-ready / provisional / ready)', () => {
  it('all-real scripts → level ready, executionReady true, no stubs', () => {
    const r = check(FULL);
    assert.strictEqual(r.level, 'ready');
    assert.strictEqual(r.executionReady, true);
    assert.deepStrictEqual(r.stubbed, []);
  });

  it('echo-stubs for the leaf bricks → level provisional: ready for bootstrap, blocked for execution', () => {
    const r = check({
      'type-check': "echo 'TODO: настроить инфраструктуру (type-check — tsc --noEmit)' >&2",
      test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
      'test:coverage': "echo 'TODO: настроить инфраструктуру (coverage)' >&2",
      format: "echo 'TODO: настроить инфраструктуру (formatter, read-only check)' >&2",
      'format:fix': "echo 'TODO: настроить formatter --write (write mode)' >&2",
      lint: 'gennady lint src/',
      'lint:fix': "echo 'TODO: настроить linter --fix (autofix)' >&2",
    });
    assert.strictEqual(r.ready, true, r.missing.join(', '));
    assert.strictEqual(r.level, 'provisional');
    assert.strictEqual(r.executionReady, false);
    assert.deepStrictEqual(r.stubbed, [
      'type-check',
      'test',
      'test:coverage',
      'format',
      'format:fix',
      'lint:fix',
    ]);
  });

  it('a not-ready project is level not-ready, never provisional, whatever its stubs', () => {
    const r = check({ test: 'echo TODO' }, { pkg: true });
    assert.strictEqual(r.level, 'not-ready');
    assert.strictEqual(r.executionReady, false);
  });

  it('a project whose real tools all swallow their exit codes is provisional, not ready — the shape is perfect, the guarantee is nil', () => {
    const r = check({
      ...FULL,
      'type-check': 'tsc --noEmit || true',
      test: 'node --test || true',
      'test:coverage': 'c8 node --test || true',
    });
    assert.strictEqual(r.ready, true, r.missing.join(', '));
    assert.strictEqual(r.level, 'provisional');
    assert.strictEqual(r.executionReady, false);
    assert.deepStrictEqual(r.stubbed, ['type-check', 'test', 'test:coverage']);
  });
});
