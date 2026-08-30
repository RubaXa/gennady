// @file: Unit tests for the exact-match readiness check.
// @consumers: readiness
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadiness, isStubScript, isVacuousScript, REQUIRED_SCRIPTS } from '../readiness.ts';

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
  fix: 'npm run format:fix -- . && npm run lint:fix -- .',
  'format:fix': 'prettier --write',
  'lint:fix': 'eslint --fix',
};

describe('REQUIRED_SCRIPTS', () => {
  it('is the exact v2 set — repair leaves and the public fix entrypoint are required', () => {
    assert.deepStrictEqual(
      [...REQUIRED_SCRIPTS],
      ['type-check', 'test', 'test:coverage', 'format', 'format:fix', 'lint', 'lint:fix', 'fix']
    );
    assert.ok(!REQUIRED_SCRIPTS.includes('check' as (typeof REQUIRED_SCRIPTS)[number]));
    assert.ok(REQUIRED_SCRIPTS.includes('fix'));
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

  it('stays ready without the optional read-only check wrapper', () => {
    const withoutWrappers = Object.fromEntries(
      Object.entries(FULL).filter(([name]) => name !== 'check')
    );
    const r = checkReadiness({
      packageJsonPresent: true,
      scripts: withoutWrappers,
      gennadyAvailable: true,
    });
    assert.strictEqual(r.ready, true);
    assert.deepStrictEqual(r.missing, []);
  });

  it('rejects a missing public whole-project fix entrypoint even when both leaves exist', () => {
    const withoutFix = Object.fromEntries(Object.entries(FULL).filter(([name]) => name !== 'fix'));
    const r = check(withoutFix);
    assert.strictEqual(r.ready, false);
    assert.ok(r.missing.includes('fix'));
  });

  it('rejects fix when it does not reach both canonical repair leaves', () => {
    const r = check({ ...FULL, fix: 'npm run format:fix' });
    assert.strictEqual(r.fixHasCanonicalRepairs, false);
    assert.ok(r.missing.includes('fix(must run format:fix then lint:fix)'));
    assert.strictEqual(r.ready, false);
  });

  it('rejects fix when lint repair runs before formatter repair', () => {
    const r = check({ ...FULL, fix: 'npm run lint:fix && npm run format:fix' });
    assert.strictEqual(r.fixHasCanonicalRepairs, false);
    assert.ok(r.missing.includes('fix(must run format:fix then lint:fix)'));
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
    const r = check({ ...FULL, 'lint:fix': 'gennady lint --autofix' });
    assert.strictEqual(r.lintFixMutates, true);
    assert.strictEqual(r.fixHasCanonicalRepairs, true);
    assert.strictEqual(r.ready, true);
  });

  it('a transitive lint:fix may mutate but is rejected as a non-transparent target prefix', () => {
    const r = check({
      ...FULL,
      'lint:fix': 'npm run lint:fix:inner',
      'lint:fix:inner': 'eslint --fix',
    });
    assert.strictEqual(r.lintFixMutates, true);
    assert.strictEqual(r.lintFixDeclaredTargetPrefix, false);
    assert.strictEqual(r.ready, false);
  });

  it('rejects a mutating repair brick with a baked-in broad root', () => {
    for (const script of ['alternative-formatter --write .', 'alternative-formatter . --write']) {
      const r = check({ ...FULL, 'format:fix': script });
      assert.strictEqual(r.formatFixMutates, true);
      assert.strictEqual(r.formatFixDeclaredTargetPrefix, false);
      assert.ok(
        r.missing.includes(
          'format:fix(must declare an argument-forwarding prefix with no obvious broad root/glob; runtime phase repair verifies actual writes)'
        )
      );
      assert.strictEqual(r.ready, false);
    }
  });

  it('honestly accepts an exact baked operand that static tool-agnostic analysis cannot classify', () => {
    const r = check({ ...FULL, 'format:fix': 'alternative-formatter src/a.ts --write' });
    assert.strictEqual(r.formatFixDeclaredTargetPrefix, true);
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

  it('ready without a `yagni` npm script — sdd-verify runs installed gennady directly, never `npm run yagni`, so no project script is required for readiness/sdd-verify consistency', () => {
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

describe('isStubScript — bootstrap-stub scope, not adversarial masking', () => {
  // A placeholder that merely NAMES another script inside an echo string never runs it — it must not
  // borrow that script's realness. This was the `echo "npm run real"` false-green: the hop scanner
  // matched `npm run` inside the quoted text and pulled the real body in.
  it('an echo placeholder that names another script in a string stays a stub', () => {
    assert.strictEqual(
      isStubScript(
        { test: 'echo "TODO: настроить через npm run build"', build: 'tsc --noEmit' },
        'test'
      ),
      true
    );
  });

  it('a REAL command-position hop to a real script is not a stub', () => {
    assert.strictEqual(
      isStubScript({ test: 'npm run build', build: 'tsc --noEmit' }, 'test'),
      false
    );
  });

  it('a command-position hop to a STUB script is still a stub', () => {
    assert.strictEqual(isStubScript({ test: 'npm run build', build: 'echo TODO' }, 'test'), true);
  });

  // Deliberately OUT OF SCOPE: we are not in a hostile environment. A hand-crafted exit-code mask
  // (`|| true`, a passthrough pipe) is the author's own choice; the safety net for genuine
  // fictitiousness is the audit + the real-toolchain e2e, never a shell-parsing heuristic. So these
  // read as real, not as stubs.
  it('adversarial exit-code masks are out of scope — treated as real, not stubs', () => {
    for (const body of ['tsc --noEmit || true', 'tsc --noEmit | cat', 'tsc --noEmit; echo done']) {
      assert.strictEqual(
        isStubScript({ test: body }, 'test'),
        false,
        `out of scope, not a stub: ${body}`
      );
    }
  });
});

describe('shape-check comment & flag holes (round 4)', () => {
  const base = {
    'type-check': 'tsc',
    test: 'node --test',
    'test:coverage': 'c8 node --test',
    format: 'prettier --check .',
  };
  const withGennady = (extra: Record<string, string>) =>
    checkReadiness({
      packageJsonPresent: true,
      gennadyAvailable: true,
      scripts: {
        ...base,
        lint: 'gennady lint .',
        'format:fix': 'prettier --write',
        'lint:fix': 'eslint --fix',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
        ...extra,
      },
    });

  it('a switch hidden in a `# comment` does not count as a real one — the fixer does not actually mutate', () => {
    const r = checkReadiness({
      packageJsonPresent: true,
      gennadyAvailable: true,
      scripts: {
        ...base,
        lint: 'eslint . # gennady',
        'format:fix': 'prettier --check . # --write',
        'lint:fix': 'eslint . # --fix',
      },
    });
    assert.strictEqual(r.formatFixMutates, false);
    assert.strictEqual(r.lintFixMutates, false);
    assert.strictEqual(r.lintHasGennady, false);
    assert.strictEqual(r.ready, false);
  });

  it('`--fix-dry-run` is not the mutating flag — a fixer built on it does not mutate', () => {
    assert.strictEqual(withGennady({ 'lint:fix': 'eslint --fix-dry-run .' }).lintFixMutates, false);
  });

  it('`gennady` in a comment or as an echo argument is not a gennady invocation', () => {
    assert.strictEqual(
      checkReadiness({
        packageJsonPresent: true,
        gennadyAvailable: true,
        scripts: {
          ...base,
          lint: 'echo gennady && eslint .',
          'format:fix': 'prettier --write',
          'lint:fix': 'eslint --fix',
        },
      }).lintHasGennady,
      false
    );
  });

  it('a genuine gennady invocation counts in every real shape, including how gennady runs its own CLI', () => {
    for (const lint of [
      'gennady lint .',
      'npx gennady lint .',
      'npx tsx cli/gennady.ts lint .',
      'tsx cli/gennady.ts lint cli/ shared/', // gennady's own package.json shape — the round-4 regression
      'node dist/gennady.js lint .',
      'FORCE_COLOR=0 gennady lint .',
    ]) {
      assert.strictEqual(withGennady({ lint }).lintHasGennady, true, `expected gennady: ${lint}`);
    }
  });

  it('gennady reached through an npm-run chain to a tsx invocation still counts (real self-hosting shape)', () => {
    assert.strictEqual(
      withGennady({
        lint: 'npm run lint:contracts',
        'lint:contracts': 'tsx cli/gennady.ts lint cli/',
      }).lintHasGennady,
      true
    );
  });

  it('an all-real project is still ready — no false positive from the tightened checks', () => {
    assert.strictEqual(withGennady({}).ready, true);
  });
});

describe('isVacuousScript', () => {
  it('a no-op stub is vacuous; a real tool is not; an adversarial mask is out of scope (real)', () => {
    assert.strictEqual(isVacuousScript({ test: 'echo TODO' }, 'test'), true);
    assert.strictEqual(isVacuousScript({ test: 'tsc --noEmit' }, 'test'), false);
    // Deliberate exit-code masking is not a bootstrap stub — out of scope, treated as real.
    assert.strictEqual(isVacuousScript({ test: 'tsc --noEmit || true' }, 'test'), false);
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
      fix: 'npm run format:fix && npm run lint:fix',
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
      'fix',
    ]);
  });

  it('a not-ready project is level not-ready, never provisional, whatever its stubs', () => {
    const r = check({ test: 'echo TODO' }, { pkg: true });
    assert.strictEqual(r.level, 'not-ready');
    assert.strictEqual(r.executionReady, false);
  });

  it('an adversarial exit-code mask (`|| true`) is out of scope — it does NOT drop to provisional', () => {
    // We are not in a hostile environment; deliberate masking is the author's own choice, not
    // something readiness pretends to statically catch. The real net for genuine fictitiousness is
    // the audit + the real-toolchain e2e (observed behaviour).
    const r = check({
      ...FULL,
      'type-check': 'tsc --noEmit || true',
      test: 'node --test || true',
    });
    assert.strictEqual(r.level, 'ready');
    assert.strictEqual(r.executionReady, true);
    assert.deepStrictEqual(r.stubbed, []);
  });
});
