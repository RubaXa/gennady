// @file: Unit tests for sdd-verify — repair-first phase profiles, read-only full verification,
//   required-script failures, and brief success/detailed failure output.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATES,
  gatesFor,
  requiredGatesFor,
  isProfile,
  verdict,
  parseInvocation,
  ERR_CLI_SDD_VERIFY_BAD_INVOCATION,
  type GateRunner,
  type GateResult,
} from '../sdd-verify.types.ts';

/** Fake runner: fails the named gates, records the commands it was asked to run. */
function fakeRunner(failNames: string[] = []): { runner: GateRunner; calls: string[] } {
  const calls: string[] = [];
  const runner: GateRunner = (command, args) => {
    const name =
      command === 'npm' && args[0] === 'run' && args[1] === 'format:fix'
        ? 'format:fix'
        : command === 'npm' && args[0] === 'run' && args[1] === 'lint:fix'
          ? 'lint:fix'
          : (args[args.length - 1] ?? '');
    calls.push(`${command} ${args.join(' ')}`);
    const fail = failNames.includes(name);
    return { exitCode: fail ? 1 : 0, output: fail ? `<<${name} failed>>` : '' };
  };
  return { runner, calls };
}

const PHASE_TARGETS = ['src/changed.ts'];
const TARGET_REPAIR_CALLS = [
  'npm run format:fix -- src/changed.ts',
  'npm run lint:fix -- src/changed.ts',
  'npx --no-install tsx cli/gennady.ts lint --autofix --include-tests -- src/changed.ts',
];
const GENNADY_TARGET_REPAIR_CALLS = [
  'npm run format:fix -- src/changed.ts',
  'npm run lint:fix -- --include-tests -- src/changed.ts',
];
const REPAIR_SCRIPTS = {
  'format:fix': 'alternative-formatter --write',
  'lint:fix': 'gennady lint --autofix',
};

// ── Mock node:fs so `isSelfHosting`/`resolveNpmScriptName` read a controlled
// package.json instead of this repo's real one — otherwise tests would be at
// the mercy of running inside gennady's own checkout (which they legitimately
// are today, but a consumer-mode test must still be exercisable). ──────────

const ALL_SCRIPTS = {
  'type-check': 'tsc',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  'format:fix': 'prettier --write',
  'lint:fix': 'eslint --fix',
  fix: 'npm run format:fix -- . && npm run lint:fix -- .',
  lint: 'eslint .',
  format: 'prettier --check .',
};

let currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });

const mockReadFileSync = mock.fn((path: string) => {
  if (String(path).endsWith('package.json')) return currentPkgJson;
  throw new Error(`unexpected readFileSync path in test: ${path}`);
});

mock.module('node:fs', {
  namedExports: {
    readFileSync: mockReadFileSync,
    statSync: mock.fn(() => ({ mtimeMs: 0 })),
  },
});

// ── Import SUT after the mock is registered ─────────────────────────────────

const {
  run,
  isSelfHosting,
  defaultRunner,
  defaultAsyncRunner,
  runWithMaxBuffer,
  GATE_MAX_BUFFER_BYTES,
} = await import('../sdd-verify.cmd.ts');

beforeEach(() => {
  currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });
});

describe('GATES', () => {
  it('is the canonical registry for repair-first phases and read-only full', () => {
    assert.deepStrictEqual(
      GATES.map((g) => g.name),
      ['fix', 'type-check', 'test', 'test:coverage', 'lint', 'format', 'yagni']
    );
  });

  it('only the exact-target phase repair mutates', () => {
    assert.deepStrictEqual(
      GATES.filter((g) => g.mutates).map((g) => g.name),
      ['fix']
    );
  });

  it('repair and foundation failures halt the ladder', () => {
    assert.deepStrictEqual(
      GATES.filter((g) => g.haltsOnFailure).map((g) => g.name),
      ['fix', 'type-check', 'test', 'test:coverage']
    );
  });
});

/** Builds a GateResult[] for the given gate names, all passing, with a plausible `ranCommand`. */
function baseResults(names: string[]): GateResult[] {
  return names.map((name) => {
    const g = GATES.find((gate) => gate.name === name)!;
    return {
      name,
      status: 'pass' as const,
      exitCode: 0,
      output: '',
      durationMs: 100,
      ranCommand: g.via === 'gennady' ? `npx --no-install gennady ${name}` : `npm run ${name}`,
      mutates: g.mutates,
    };
  });
}

describe('verdict', () => {
  it('all pass → brief ✅ ALL PASS with a line per gate', () => {
    const results = baseResults(['type-check', 'test:coverage', 'lint', 'format', 'yagni']);
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (v.ok) {
      assert.match(v.text, /✅ ALL PASS \(5\/5\)/);
      assert.match(v.text, /^\[sdd-verify\]/);
      assert.match(v.text, /✅ test:coverage/);
      assert.match(v.text, /✅ yagni/);
    }
  });

  it('a failure → exit 1; only the failed gate dumps output, and names the command it ran', () => {
    const results = baseResults(['type-check', 'test:coverage', 'lint', 'format']).map((r) => ({
      ...r,
      status: r.name === 'lint' ? ('fail' as const) : r.status,
      exitCode: r.name === 'lint' ? 1 : 0,
      output: r.name === 'lint' ? 'no-unused-vars ...' : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (!v.ok) {
      assert.strictEqual(v.exitCode, 1);
      assert.match(v.message, /❌ lint — exit 1 \(ran: npm run lint\)/);
      assert.match(v.message, /^\[sdd-verify\]/);
      assert.match(v.message, /no-unused-vars/);
      assert.match(v.message, /✅ format/);
      assert.doesNotMatch(v.message, /❌ format/);
    }
  });

  it('a failed repair rung is marked with 🔧 and reports an incomplete repair', () => {
    const results = baseResults(['fix']).map((r) => ({
      ...r,
      status: 'fail' as const,
      exitCode: 1,
      output: 'could not fix everything',
    }));
    const v = verdict(results, 'fix');
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /🔧 fix — exit 1 .* — repair не завершён/);
    assert.match(v.message, /лестница остановлена на «fix»/);
    assert.match(v.message, /could not fix everything/);
  });

  it('a passing mutating rung is marked with 🔧, not ✅', () => {
    const results = baseResults(['fix', 'type-check']);
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (!v.ok) return;
    assert.match(v.text, /🔧 fix \(\d+\.\d+s\) — мутирующий шаг/);
    assert.match(v.text, /✅ type-check \(\d+\.\d+s\)/);
  });

  it('a skipped rung is neither ✅ nor ❌ — an honest ⏭ line, and does not fail the run', () => {
    const results: GateResult[] = [
      ...baseResults(['type-check']),
      {
        name: 'fix',
        status: 'skipped',
        exitCode: 0,
        output: '',
        durationMs: 0,
        ranCommand: '',
        mutates: true,
      },
      ...baseResults(['format']),
    ];
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (!v.ok) return;
    assert.match(v.text, /⏭ fix — скрипта нет в package\.json, пропущено/);
    assert.doesNotMatch(v.text, /❌ fix/);
    assert.doesNotMatch(v.text, /✅ fix/);
  });

  it('a halted ladder names the stopping gate and the reason in the final line', () => {
    const results = baseResults(['type-check']).map((r) => ({
      ...r,
      status: 'fail' as const,
      exitCode: 2,
      output: 'TS2345 ...',
    }));
    const v = verdict(results, 'type-check');
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(
      v.message,
      /⛔ лестница остановлена на «type-check» — код не собирается — дальше нечего проверять и чинить, дальше не пошли$/
    );
  });

  it('a halted ladder at the test foundation names the test-specific reason', () => {
    const results = baseResults(['type-check', 'test:coverage']).map((r) => ({
      ...r,
      status: r.name === 'test:coverage' ? ('fail' as const) : r.status,
      exitCode: r.name === 'test:coverage' ? 1 : 0,
      output: r.name === 'test:coverage' ? 'assertion failed' : '',
    }));
    const v = verdict(results, 'test:coverage');
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /лестница остановлена на «test:coverage» — тесты не проходят/);
  });

  it('no haltedAt → no stop-line, even on failure', () => {
    const results = baseResults(['lint', 'format']).map((r) => ({
      ...r,
      status: r.name === 'lint' ? ('fail' as const) : r.status,
      exitCode: r.name === 'lint' ? 1 : 0,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.doesNotMatch(v.message, /лестница остановлена/);
  });

  it('a runaway failed gate is tail-capped to its last 120 lines with a truncation note', () => {
    const bigOutput = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const results = baseResults(['type-check', 'test:coverage', 'lint', 'format']).map((r) => ({
      ...r,
      status: r.name === 'test:coverage' ? ('fail' as const) : r.status,
      exitCode: r.name === 'test:coverage' ? 1 : 0,
      output: r.name === 'test:coverage' ? bigOutput : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(
      v.message,
      /… output truncated to last 120 lines — full transcript: npm run test:coverage/
    );
    assert.doesNotMatch(v.message, /line 379\b/); // dropped — only the last 120 lines (380..499) survive
    assert.match(v.message, /line 499/); // the tail is kept
    assert.doesNotMatch(v.message, /^line 0$/m);
  });

  it('`not ok` lines dropped by the tail cap resurface as a failure digest above the tail', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    lines[3] = 'not ok 2 - the actual broken test name';
    const results = baseResults(['type-check', 'test:coverage', 'lint', 'format']).map((r) => ({
      ...r,
      status: r.name === 'test:coverage' ? ('fail' as const) : r.status,
      exitCode: r.name === 'test:coverage' ? 1 : 0,
      output: r.name === 'test:coverage' ? lines.join('\n') : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /failing tests dropped by the cap \(first 1\):/);
    assert.match(v.message, /not ok 2 - the actual broken test name/);
  });

  it('output that already fits both bounds is left untouched (no truncation note)', () => {
    const results = baseResults(['type-check', 'lint']).map((r) => ({
      ...r,
      status: r.name === 'lint' ? ('fail' as const) : r.status,
      exitCode: r.name === 'lint' ? 1 : 0,
      output: r.name === 'lint' ? 'short failure\ndetail line' : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /short failure/);
    assert.match(v.message, /detail line/);
    assert.doesNotMatch(v.message, /truncated/);
  });

  it('a failed gate whose few lines still exceed 16KB is byte-capped, not just line-capped', () => {
    const hugeLine = 'x'.repeat(20 * 1024); // 20KB on one line — over the 16KB cap alone
    const output = ['first line', hugeLine].join('\n');
    const results = baseResults(['type-check', 'yagni']).map((r) => ({
      ...r,
      status: r.name === 'yagni' ? ('fail' as const) : r.status,
      exitCode: r.name === 'yagni' ? 1 : 0,
      output: r.name === 'yagni' ? output : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /truncated/);
    assert.doesNotMatch(v.message, /first line/); // dropped to satisfy the 16KB bound
  });

  it('the truncation note names the actual ranCommand, not a hardcoded npm form', () => {
    const bigOutput = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const results = baseResults(['type-check', 'yagni']).map((r) => ({
      ...r,
      status: r.name === 'yagni' ? ('fail' as const) : r.status,
      exitCode: r.name === 'yagni' ? 1 : 0,
      output: r.name === 'yagni' ? bigOutput : '',
      ranCommand: r.name === 'yagni' ? 'npx --no-install tsx cli/gennady.ts yagni' : r.ranCommand,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(
      v.message,
      /❌ yagni — exit 1 \(ran: npx --no-install tsx cli\/gennady\.ts yagni\)/
    );
    assert.match(
      v.message,
      /… output truncated to last 120 lines — full transcript: npx --no-install tsx cli\/gennady\.ts yagni/
    );
  });
});

describe('profiles', () => {
  it('gatesFor subsets GATES in canonical ladder order per profile — exact arrays', () => {
    assert.deepStrictEqual(
      gatesFor('setup').map((g) => g.name),
      ['fix', 'type-check', 'test']
    );
    assert.deepStrictEqual(
      gatesFor('code').map((g) => g.name),
      ['fix', 'type-check', 'test']
    );
    assert.deepStrictEqual(
      gatesFor('test').map((g) => g.name),
      ['fix', 'type-check', 'test:coverage']
    );
    assert.deepStrictEqual(
      gatesFor('full').map((g) => g.name),
      ['type-check', 'test:coverage', 'lint', 'format', 'yagni']
    );
  });

  it('setup and code compose the identical ladder', () => {
    assert.deepStrictEqual(gatesFor('setup'), gatesFor('code'));
  });

  it('full carries no mutating rungs — a final verdict must not mutate what it judges', () => {
    assert.deepStrictEqual(
      gatesFor('full').filter((g) => g.mutates),
      []
    );
  });

  it('test profile repairs first, then measures coverage without a public lint/check duplicate', () => {
    const names = gatesFor('test').map((g) => g.name);
    assert.ok(!names.includes('lint'));
    assert.ok(names.includes('fix'));
    assert.ok(names.includes('test:coverage'));
  });

  it('test profile without producer applicability keeps its profile but selects ordinary test', () => {
    assert.deepStrictEqual(
      gatesFor('test', false).map((gate) => gate.name),
      ['fix', 'type-check', 'test']
    );
    assert.deepStrictEqual(requiredGatesFor('test', false), ['fix', 'type-check', 'test']);
  });

  it('isProfile guards CLI input', () => {
    assert.ok(isProfile('setup') && isProfile('code') && isProfile('test') && isProfile('full'));
    assert.ok(!isProfile('all') && !isProfile(''));
  });
});

describe('run — ladder halting on a broken foundation', () => {
  it('executes the accepted typecheck alias when the canonical script is absent', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { ...ALL_SCRIPTS, 'type-check': undefined, typecheck: 'tsc --noEmit' },
    });
    const { runner, calls } = fakeRunner();
    const outcome = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(outcome.ok, true);
    assert.ok(calls.includes('npm run typecheck'));
    assert.ok(!calls.includes('npm run type-check'));
  });

  it('type-check failure stops the ladder — nothing after it runs', async () => {
    const { runner, calls } = fakeRunner(['type-check']);
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, ['npm run type-check']);
    if (!o.ok) {
      assert.match(o.message, /лестница остановлена на «type-check»/);
    }
  });

  it('test failure stops after repair and types — no later work runs', async () => {
    const { runner, calls } = fakeRunner(['test']);
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, [...TARGET_REPAIR_CALLS, 'npm run type-check', 'npm run test']);
    if (!o.ok) {
      assert.match(o.message, /лестница остановлена на «test»/);
    }
  });

  it('a non-producing test context requires and runs test, never test:coverage', async () => {
    const { runner, calls } = fakeRunner();
    const outcome = await run(runner, 'test', undefined, {
      targets: PHASE_TARGETS,
      producesCoverage: false,
    });
    assert.strictEqual(outcome.ok, true);
    assert.deepStrictEqual(calls, [...TARGET_REPAIR_CALLS, 'npm run type-check', 'npm run test']);
  });

  it('test:coverage failure (test/full profile) stops the ladder', async () => {
    const { runner, calls } = fakeRunner(['test:coverage']);
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, ['npm run type-check', 'npm run test:coverage']);
    if (!o.ok) {
      assert.match(o.message, /лестница остановлена на «test:coverage»/);
    }
  });

  it('a failing repair halts before foundation because no clean post-state was established', async () => {
    const { runner, calls } = fakeRunner(['format:fix']);
    const o = await run(runner, 'setup', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, [TARGET_REPAIR_CALLS[0]]);
    if (!o.ok) {
      assert.match(o.message, /🔧 fix — exit 1/);
      assert.match(o.message, /лестница остановлена на «fix»/);
    }
  });
});

describe('run — skipping a missing npm script', () => {
  it('a step whose npm script is absent is skipped honestly, not treated as a failure', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'type-check': 'tsc', test: 'node --test' },
      // no fix declared — legal only for bootstrap setup
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, ['npm run type-check', 'npm run test']);
    if (o.ok) {
      assert.match(o.text, /⏭ fix — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /ALL PASS/);
    }
  });

  it('setup profile: a missing foundation rung is still an honest skip — setup runs before the infrastructure exists', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: {},
      // no type-check / test declared — legal for setup, and only for setup
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, []);
    if (o.ok) {
      assert.match(o.text, /⏭ type-check — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /⏭ test — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /⏭ fix — скрипта нет в package\.json, пропущено/);
    }
  });
});

describe('run — required rungs refuse to skip (code/test/full)', () => {
  it('code refuses absent or vacuous repair prefixes before spawning repair/foundation', async () => {
    for (const scripts of [
      { 'type-check': 'tsc', test: 'node --test', 'lint:fix': 'eslint --fix .' },
      {
        'type-check': 'tsc',
        test: 'node --test',
        'format:fix': 'echo TODO',
        'lint:fix': 'eslint --fix',
      },
    ]) {
      currentPkgJson = JSON.stringify({ name: 'gennady', scripts });
      const { runner, calls } = fakeRunner();
      const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
      assert.strictEqual(o.ok, false);
      assert.deepStrictEqual(calls, []);
      if (!o.ok) assert.match(o.message, /declared argument-forwarding repair prefixes/);
    }
  });

  it('test profile without type-check → red ⛔ verdict, nothing later runs', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { ...REPAIR_SCRIPTS, 'test:coverage': 'c8 node --test' },
      // no type-check declared — required for the test profile
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'test', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, GENNADY_TARGET_REPAIR_CALLS);
    if (o.ok) return;
    assert.match(o.message, /⛔ type-check — обязательная ступень профиля «test»/);
    assert.match(o.message, /скрипта нет в package\.json/);
    assert.match(o.message, /GATE_QUEUE/);
  });

  it('code profile without test → red, after type-check has already run', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { ...REPAIR_SCRIPTS, 'type-check': 'tsc' },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, [...GENNADY_TARGET_REPAIR_CALLS, 'npm run type-check']);
    if (o.ok) return;
    assert.match(o.message, /⛔ test — обязательная ступень профиля «code»/);
  });

  it('code does not require separate public lint/format after the strong repair command', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { ...REPAIR_SCRIPTS, 'type-check': 'tsc', test: 'node --test' },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      ...GENNADY_TARGET_REPAIR_CALLS,
      'npm run type-check',
      'npm run test',
    ]);
  });

  it('full requires lint AND format — a full verdict never goes green with a quality gate missing (B3)', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'type-check': 'tsc', 'test:coverage': 'c8 node --test', lint: 'gennady lint .' },
      // no format declared — required for full
    });
    const { runner } = fakeRunner();
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.match(o.message, /⛔ format — обязательная ступень профиля «full»/);
  });

  it('an echo-stub required script is as red as a missing one — exit 0 that verifies nothing is a fiction', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: {
        ...REPAIR_SCRIPTS,
        'type-check': 'tsc',
        test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
        format: 'prettier --check .',
      },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, false);
    assert.ok(!calls.includes('npm run test'), 'a stub must never be run and counted as pass');
    if (o.ok) return;
    assert.match(o.message, /⛔ test — обязательная ступень профиля «code»/);
    assert.match(o.message, /заглушка \(no-op\)/);
  });

  it('a deliberately masked exit code (`|| true`) is OUT OF SCOPE — the gate runs, it is not refused', async () => {
    // Readiness catches classic bootstrap stubs (echo/`:`), NOT hand-crafted exit-code masks: we are
    // not in a hostile environment, and the net for genuine fictitiousness is the audit +
    // real-toolchain e2e. So the masked script is treated as a real tool and actually executes.
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: {
        ...REPAIR_SCRIPTS,
        'type-check': 'tsc --noEmit',
        test: 'node --test || true',
        format: 'prettier --check .',
      },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.ok(calls.includes('npm run test'), 'the masked script is treated as real and runs');
    const text = o.ok ? o.text : o.message;
    assert.doesNotMatch(text, /⛔ test — обязательная ступень профиля «code»/);
  });

  it('setup profile green verdict states its own weight — a bootstrap verdict is not a code-phase verdict', async () => {
    const { runner } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    if (!o.ok) return;
    assert.match(o.text, /профиль setup — вердикт уровня bootstrap/);
    assert.match(o.text, /для impl\/refactor\/test-фазы он НЕ является доказательством/i);
  });

  it('a code-profile green verdict carries no such disclaimer', async () => {
    const { runner } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, true);
    if (!o.ok) return;
    assert.doesNotMatch(o.text, /уровня bootstrap/);
  });

  it('setup profile happily runs the same stub — bootstrap is its legal state', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: {
        'type-check': 'tsc',
        test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
        format: 'prettier --check .',
      },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    assert.ok(calls.includes('npm run test'));
  });
});

describe('run — test:coverage only produces the report, never gates the threshold', () => {
  it('test:coverage exit 0 passes on the exit code alone — the % threshold is testcov/audit territory', async () => {
    const { runner } = fakeRunner();
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, true, o.ok ? '' : o.message);
  });
});

describe('run — repair-first call counts', () => {
  it('shares strict adjacent gates and isolates coverage allowance in its own transaction', async () => {
    const calls: { stage: 'before' | 'after'; artifacts: readonly string[] }[] = [];
    const boundary = {
      before: (_targets: readonly string[], artifacts: readonly string[] = []) => {
        calls.push({ stage: 'before', artifacts: [...artifacts] });
        return {} as never;
      },
      after: (
        _snapshot: unknown,
        _targets: readonly string[],
        artifacts: readonly string[] = []
      ) => {
        calls.push({ stage: 'after', artifacts: [...artifacts] });
        return { ok: true as const };
      },
      checkpoint: (
        _snapshot: unknown,
        _targets: readonly string[],
        artifacts: readonly string[],
        _nextTargets: readonly string[],
        nextArtifacts: readonly string[]
      ) => {
        calls.push({ stage: 'after', artifacts: [...artifacts] });
        calls.push({ stage: 'before', artifacts: [...nextArtifacts] });
        return { result: { ok: true as const }, snapshot: {} as never };
      },
    };
    const repair = {
      before: () => ({}) as never,
      after: () => ({ ok: true as const }),
      checkpoint: () => ({ result: { ok: true as const }, snapshot: {} as never }),
    };
    const coverageProbe = {
      writableArtifactDirectories: ['coverage'],
      clear: () => ({ ok: true as const }),
      wroteFresh: () => ({ ok: true as const }),
    };

    assert.strictEqual(
      (
        await run(
          fakeRunner().runner,
          'code',
          coverageProbe,
          { targets: PHASE_TARGETS },
          undefined,
          { repair, foundation: boundary }
        )
      ).ok,
      true
    );
    assert.deepStrictEqual(calls, [
      { stage: 'before', artifacts: [] },
      { stage: 'after', artifacts: [] },
    ]);

    calls.length = 0;
    assert.strictEqual(
      (
        await run(
          fakeRunner().runner,
          'test',
          coverageProbe,
          { targets: PHASE_TARGETS, producesCoverage: true },
          undefined,
          { repair, foundation: boundary }
        )
      ).ok,
      true
    );
    assert.deepStrictEqual(calls, [
      { stage: 'before', artifacts: [] },
      { stage: 'after', artifacts: [] },
      { stage: 'before', artifacts: ['coverage'] },
      { stage: 'after', artifacts: ['coverage'] },
    ]);
  });

  it('a mutating repair path still runs type-check and test exactly once over post-state', async () => {
    const calls: string[] = [];
    const runner: GateRunner = (command, args) => {
      const cmd = `${command} ${args.join(' ')}`;
      calls.push(cmd);
      return { exitCode: 0, output: cmd.includes('--autofix') ? 'Auto-fixed: 2 error(s)' : '' };
    };
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [...TARGET_REPAIR_CALLS, 'npm run type-check', 'npm run test']);
  });

  it('a clean repair path has the same single foundation pass', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, { targets: PHASE_TARGETS });
    assert.strictEqual(o.ok, true);
    assert.strictEqual(calls.filter((c) => c === 'npm run test').length, 1);
    assert.strictEqual(calls.filter((c) => c === 'npm run type-check').length, 1);
    assert.deepStrictEqual(calls, [...TARGET_REPAIR_CALLS, 'npm run type-check', 'npm run test']);
  });

  it('test profile repairs test files before one type-check and one coverage run', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'test', undefined, { targets: ['src/new.test.ts'] });
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run format:fix -- src/new.test.ts',
      'npm run lint:fix -- src/new.test.ts',
      'npx --no-install tsx cli/gennady.ts lint --autofix --include-tests -- src/new.test.ts',
      'npm run type-check',
      'npm run test:coverage',
    ]);
  });

  it('phase repair keeps the project linter generic and passes owning spec only to contract lint', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code', undefined, {
      targets: PHASE_TARGETS,
      specPath: 'specs/app/app.spec.md',
    });
    assert.strictEqual(o.ok, true);
    assert.strictEqual(calls[1], 'npm run lint:fix -- src/changed.ts');
    assert.strictEqual(
      calls[2],
      'npx --no-install tsx cli/gennady.ts lint --autofix --include-tests --spec=specs/app/app.spec.md -- src/changed.ts'
    );
  });
});

describe('parseInvocation', () => {
  // parseArgs (shared/common/parse-args.ts) keeps process.argv[2] — the command token itself —
  // inside `_`, so every case below prefixes argv with the real `node script sdd-verify` shape.
  const argv = (...rest: string[]): string[] => ['node', 'gennady.ts', 'sdd-verify', ...rest];

  it('no flags → defaults to the full profile', () => {
    const r = parseInvocation(argv());
    assert.deepStrictEqual(r, { ok: true, mode: 'full', profile: 'full' });
  });

  it('--task and --phase carry only structural phase identity', () => {
    assert.deepStrictEqual(
      parseInvocation(argv('--task', 'specs/app/app.task.TSK-1.md', '--phase', 'P2')),
      {
        ok: true,
        mode: 'phase',
        task: 'specs/app/app.task.TSK-1.md',
        phase: 'P2',
      }
    );
  });

  it('partial phase context fails closed; full rejects phase context', () => {
    const partial = parseInvocation(argv('--task', 'specs/app/app.task.TSK-1.md'));
    assert.strictEqual(partial.ok, false);
    if (!partial.ok) assert.match(partial.message, /requires both --task.*--phase/);

    const full = parseInvocation(argv('--profile', 'full', '--task', 'ticket.md', '--phase', 'P1'));
    assert.strictEqual(full.ok, false);
    if (!full.ok) assert.match(full.message, /full.*cannot be combined/);
  });

  it('a bare path — the exact real-world defect (a worker appending a target file) — is a hard error, not a silently ignored no-op', () => {
    const r = parseInvocation(argv('--profile', 'code', 'ai/kit/lazy-assembly.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /unexpected path argument\(s\): ai\/kit\/lazy-assembly\.ts/);
    assert.match(r.message, /--task <ticket-path> --phase <PhaseID>/);
  });

  it('multiple stray paths are all named in the error', () => {
    const r = parseInvocation(argv('foo.ts', 'bar.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /unexpected path argument\(s\): foo\.ts bar\.ts/);
  });

  it('does not discard a positional argument merely because it equals the command token', () => {
    const r = parseInvocation(argv('sdd-verify'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /unexpected path argument\(s\): sdd-verify/);
  });

  it('an unrelated unknown flag (--scope) is rejected, not silently dropped', () => {
    const r = parseInvocation(argv('--scope', 'src'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /scope/);
  });

  it('a misspelled flag (--profil, missing the trailing e) is rejected, not silently dropped', () => {
    const r = parseInvocation(argv('--profil', 'code'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /profil/);
  });

  it('phase profiles cannot be selected manually', () => {
    const r = parseInvocation(argv('--profile', 'bogus'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /only '--profile full' is public/);
  });

  it('bad-invocation message always carries the usage line', () => {
    const r = parseInvocation(argv('stray.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /usage: npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>/);
  });

  it('missing, empty, and repeated scalar values are hard errors, never implicit full', () => {
    const invalid = [
      ['--profile'],
      ['--profile='],
      ['--profile', 'full', '--profile', 'full'],
      ['--task'],
      ['--task='],
      ['--task', 'a.md', '--task', 'b.md', '--phase', 'P1'],
      ['--phase'],
      ['--phase='],
      ['--task', 'a.md', '--phase', 'P1', '--phase', 'P2'],
    ];
    for (const args of invalid) {
      const result = parseInvocation(argv(...args));
      assert.strictEqual(result.ok, false, args.join(' '));
      if (!result.ok) {
        assert.match(result.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
        assert.match(result.message, /requires exactly one non-empty value/);
        assert.match(result.message, /usage: npx gennady sdd-verify/);
      }
    }
  });
});

describe('isSelfHosting', () => {
  it('true when the project package.json name is exactly "gennady"', () => {
    currentPkgJson = JSON.stringify({ name: 'gennady' });
    assert.strictEqual(isSelfHosting(), true);
  });

  it('false for a consumer project — detected by package name, never by directory/path', () => {
    currentPkgJson = JSON.stringify({ name: 'some-consumer-app' });
    assert.strictEqual(isSelfHosting(), false);
  });

  it('false when package.json is missing or unparsable — fails closed to consumer behavior', () => {
    currentPkgJson = 'not json';
    assert.strictEqual(isSelfHosting(), false);
  });
});

describe('run — via: gennady gate dispatch', () => {
  it('self-hosting (package.json name: gennady) → calls the local source through tsx', async () => {
    currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run type-check',
      'npm run test:coverage',
      'npm run lint',
      'npm run format',
      'npx --no-install tsx cli/gennady.ts yagni',
    ]);
  });

  it('consumer project (package.json name ≠ gennady) → calls installed gennady with no download fallback', async () => {
    currentPkgJson = JSON.stringify({
      name: 'some-consumer-app',
      scripts: ALL_SCRIPTS,
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run type-check',
      'npm run test:coverage',
      'npm run lint',
      'npm run format',
      'npx --no-install gennady yagni',
    ]);
  });

  it('a failing gennady gate names the actual command it ran, in both modes', async () => {
    currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });
    const selfHosted = await run(fakeRunner(['yagni']).runner, 'full');
    assert.strictEqual(selfHosted.ok, false);
    if (!selfHosted.ok) {
      assert.match(
        selfHosted.message,
        /❌ yagni — exit 1 \(ran: npx --no-install tsx cli\/gennady\.ts yagni\)/
      );
    }

    currentPkgJson = JSON.stringify({ name: 'some-consumer-app', scripts: ALL_SCRIPTS });
    const consumer = await run(fakeRunner(['yagni']).runner, 'full');
    assert.strictEqual(consumer.ok, false);
    if (!consumer.ok) {
      assert.match(consumer.message, /❌ yagni — exit 1 \(ran: npx --no-install gennady yagni\)/);
    }
  });

  it('yagni gate is never proxied through a project npm script — the project need not declare one', async () => {
    const { runner, calls } = fakeRunner();
    await run(runner, 'full');
    assert.ok(!calls.includes('npm run yagni'));
    assert.ok(calls.some((c) => c.endsWith(' yagni')));
  });
});

describe('defaultRunner — real spawnSync maxBuffer behavior', () => {
  it('GATE_MAX_BUFFER_BYTES is generously above the default 1MB (real TAP output measured ~1.08MB)', () => {
    assert.strictEqual(GATE_MAX_BUFFER_BYTES, 64 * 1024 * 1024);
    assert.ok(GATE_MAX_BUFFER_BYTES > 1024 * 1024);
  });

  it('captures output well past the old 1MB default without ENOBUFS', () => {
    // node's default spawnSync maxBuffer is 1MB; write 2MB so this only passes if
    // defaultRunner's own maxBuffer override is actually in effect.
    const r = defaultRunner('node', ['-e', "process.stdout.write('x'.repeat(2 * 1024 * 1024))"]);
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.output.length, 2 * 1024 * 1024);
  });

  it('a real overflow past maxBuffer is reported honestly (spawn error, exit 127) — never a silently truncated verdict', () => {
    const r = runWithMaxBuffer(
      'node',
      ['-e', "process.stdout.write('x'.repeat(10_000))"],
      100 // tiny on purpose — forces a real spawnSync maxBuffer overflow
    );
    assert.strictEqual(r.exitCode, 127);
    assert.match(r.output, /node:/); // command name prefix
    assert.ok(r.output.length < 1000); // an honest short error, not a clipped 100-byte fragment of stdout
    assert.doesNotMatch(r.output, /^x+$/); // never a silent partial-output truncation
  });
});

describe('defaultAsyncRunner — no-shell exit and maxBuffer behavior', () => {
  it('captures output well past Node defaults with the production 64MB ceiling', async () => {
    const result = await defaultAsyncRunner('node', [
      '-e',
      "process.stdout.write('x'.repeat(2 * 1024 * 1024))",
    ]);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.output.length, 2 * 1024 * 1024);
  });

  it('preserves a real numeric child exit and its stderr', async () => {
    const result = await defaultAsyncRunner('node', [
      '-e',
      "process.stderr.write('quality failed');process.exit(7)",
    ]);
    assert.strictEqual(result.exitCode, 7);
    assert.strictEqual(result.output, 'quality failed');
  });

  it('reports overflow and spawn errors as honest exit 127 diagnostics', async () => {
    const overflow = await defaultAsyncRunner(
      'node',
      ['-e', "process.stdout.write('x'.repeat(10_000))"],
      100
    );
    assert.strictEqual(overflow.exitCode, 127);
    assert.match(overflow.output, /node:/);

    const missing = await defaultAsyncRunner('definitely-not-a-real-gennady-command', []);
    assert.strictEqual(missing.exitCode, 127);
    assert.match(missing.output, /definitely-not-a-real-gennady-command/);
  });
});

describe('run', () => {
  it('defaults to the full 5-gate ladder — npm scripts as `npm run <name>`, yagni direct', async () => {
    const { runner, calls } = fakeRunner();
    const o = await run(runner);
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run type-check',
      'npm run test:coverage',
      'npm run lint',
      'npm run format',
      'npx --no-install tsx cli/gennady.ts yagni', // self-hosting default set in beforeEach
    ]);
  });

  it('RUN-ALL past the foundation: a quality-rung failure keeps running and exits 1', async () => {
    const { runner, calls } = fakeRunner(['lint']);
    const o = await run(runner);
    assert.strictEqual(o.ok === false && o.exitCode, 1);
    assert.strictEqual(calls.length, 5);
  });

  it('overlaps the independent quality tail but renders results in canonical order', async () => {
    let activeQuality = 0;
    let peakQuality = 0;
    const completed: string[] = [];
    const runner: GateRunner = async (command, args) => {
      const name = command === 'npm' ? (args[1] ?? '') : (args.at(-1) ?? '');
      if (!['lint', 'format', 'yagni'].includes(name)) return { exitCode: 0, output: '' };
      activeQuality++;
      peakQuality = Math.max(peakQuality, activeQuality);
      const delay = name === 'lint' ? 30 : name === 'format' ? 5 : 15;
      await new Promise((resolve) => setTimeout(resolve, delay));
      completed.push(name);
      activeQuality--;
      return { exitCode: 0, output: '' };
    };

    const outcome = await run(runner, 'full');

    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(peakQuality, 3, 'all three independent quality commands overlap');
    assert.deepStrictEqual(
      completed,
      ['format', 'yagni', 'lint'],
      'fixture proves out-of-order finish'
    );
    if (!outcome.ok) return;
    assert.ok(outcome.text.indexOf('✅ lint') < outcome.text.indexOf('✅ format'));
    assert.ok(outcome.text.indexOf('✅ format') < outcome.text.indexOf('✅ yagni'));
  });

  it('accumulates multiple concurrent quality failures instead of short-circuiting', async () => {
    const evidence: GateResult[] = [];
    const runner: GateRunner = async (command, args) => {
      const name = command === 'npm' ? (args[1] ?? '') : (args.at(-1) ?? '');
      await new Promise((resolve) => setTimeout(resolve, name === 'lint' ? 10 : 1));
      const failed = name === 'lint' || name === 'yagni';
      return { exitCode: failed ? 1 : 0, output: failed ? `${name} failed` : '' };
    };

    const outcome = await run(runner, 'full', undefined, { targets: [] }, evidence);

    assert.strictEqual(outcome.ok, false);
    if (outcome.ok) return;
    assert.match(outcome.message, /❌ lint/);
    assert.match(outcome.message, /❌ yagni/);
    assert.match(outcome.message, /✅ format/);
    assert.deepStrictEqual(
      evidence.map((result) => result.name),
      ['type-check', 'test:coverage', 'lint', 'format', 'yagni'],
      'machine evidence stays canonical even when concurrent completion order differs'
    );
    assert.ok(outcome.message.indexOf('❌ lint') < outcome.message.indexOf('❌ yagni'));
  });

  it('closes one zero-write boundary around the whole quality tail and never invents a culprit', async () => {
    let directClosures = 0;
    let checkpoints = 0;
    const foundation = {
      before: () => ({}) as never,
      checkpoint: () => {
        checkpoints++;
        return { result: { ok: true as const }, snapshot: {} as never };
      },
      after: () => {
        directClosures++;
        return {
          ok: false as const,
          issue: 'full-profile gate mutated paths outside its permitted write-set',
          paths: ['src/drift.ts'],
        };
      },
    };
    const repair = {
      before: () => ({}) as never,
      checkpoint: () => ({ result: { ok: true as const }, snapshot: {} as never }),
      after: () => ({ ok: true as const }),
    };
    const coverageProbe = {
      writableArtifactDirectories: ['coverage'],
      clear: () => ({ ok: true as const }),
      wroteFresh: () => ({ ok: true as const }),
    };

    const outcome = await run(
      fakeRunner().runner,
      'full',
      coverageProbe,
      { targets: [] },
      undefined,
      { repair, foundation }
    );

    assert.strictEqual(directClosures, 1, 'the quality tail has one shared final inspection');
    assert.strictEqual(
      checkpoints,
      2,
      'type→coverage and coverage→quality reuse adjacent snapshots'
    );
    assert.strictEqual(outcome.ok, false);
    if (outcome.ok) return;
    assert.match(outcome.message, /foundation segment lint → format → yagni/);
    assert.match(outcome.message, /src\/drift\.ts/);
    assert.doesNotMatch(outcome.message, /(?:lint|format|yagni) mutated paths/);
  });
});
