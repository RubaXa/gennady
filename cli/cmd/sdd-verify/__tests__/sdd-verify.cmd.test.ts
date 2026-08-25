// @file: Unit tests for sdd-verify — the verification ladder: profile composition, halt-on-broken-
//   foundation, non-halting repair findings, honest script-missing skips, brief success/detailed
//   failure output.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATES,
  gatesFor,
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
    const name = args[args.length - 1] ?? '';
    calls.push(`${command} ${args.join(' ')}`);
    const fail = failNames.includes(name);
    return { exitCode: fail ? 1 : 0, output: fail ? `<<${name} failed>>` : '' };
  };
  return { runner, calls };
}

// ── Mock node:fs so `isSelfHosting`/`resolveNpmScriptName` read a controlled
// package.json instead of this repo's real one — otherwise tests would be at
// the mercy of running inside gennady's own checkout (which they legitimately
// are today, but a consumer-mode test must still be exercisable). ──────────

const ALL_SCRIPTS = {
  'type-check': 'tsc',
  test: 'node --test',
  'test:coverage': 'c8 node --test',
  'format:fix': 'prettier --write .',
  'lint:fix': 'eslint --fix .',
  lint: 'eslint .',
  format: 'prettier --check .',
};

let currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });

// Knobs for the fs surface the ladder touches beyond package.json: the coverage-artifact freshness
// check (readdirSync('coverage') + statSync) and the pre/post-mutation tree fingerprint.
let coverageDirExists = true;
let rootFiles: string[] = [];
let currentMtimeMs = Date.now() + 60_000; // future-dated → always "fresh" unless a test says otherwise

const mockReadFileSync = mock.fn((path: string) => {
  if (String(path).endsWith('package.json')) return currentPkgJson;
  throw new Error(`unexpected readFileSync path in test: ${path}`);
});

const dirent = (name: string) => ({ name, isFile: () => true, isDirectory: () => false });

const mockReaddirSync = mock.fn((dir: string) => {
  if (String(dir) === 'coverage') {
    if (!coverageDirExists) throw new Error('ENOENT: coverage');
    return [dirent('coverage-final.json')];
  }
  if (String(dir) === '.') return rootFiles.map(dirent);
  return [];
});

const mockStatSync = mock.fn(() => ({ mtimeMs: currentMtimeMs, size: 1 }));

mock.module('node:fs', {
  namedExports: {
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  },
});

// ── Import SUT after the mock is registered ─────────────────────────────────

const { run, isSelfHosting, defaultRunner, runWithMaxBuffer, GATE_MAX_BUFFER_BYTES } =
  await import('../sdd-verify.cmd.ts');

beforeEach(() => {
  currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });
  coverageDirExists = true;
  rootFiles = [];
  currentMtimeMs = Date.now() + 60_000;
});

describe('GATES', () => {
  it('is the canonical ladder, cheapest-and-most-important-first', () => {
    assert.deepStrictEqual(
      GATES.map((g) => g.name),
      ['type-check', 'test', 'test:coverage', 'format:fix', 'lint:fix', 'lint', 'format', 'yagni']
    );
  });

  it('only format:fix and lint:fix mutate', () => {
    assert.deepStrictEqual(
      GATES.filter((g) => g.mutates).map((g) => g.name),
      ['format:fix', 'lint:fix']
    );
  });

  it('only the foundation rungs (type-check, test, test:coverage) halt the ladder', () => {
    assert.deepStrictEqual(
      GATES.filter((g) => g.haltsOnFailure).map((g) => g.name),
      ['type-check', 'test', 'test:coverage']
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
      ranCommand: g.via === 'gennady' ? `npx gennady ${name}` : `npm run ${name}`,
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

  it('a failed mutating rung is marked with 🔧, noted as a finding that never halts', () => {
    const results = baseResults(['type-check', 'test', 'format:fix', 'format']).map((r) => ({
      ...r,
      status: r.name === 'format:fix' ? ('fail' as const) : r.status,
      exitCode: r.name === 'format:fix' ? 1 : 0,
      output: r.name === 'format:fix' ? 'could not fix everything' : '',
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /🔧 format:fix — exit 1 .* — находка, не останавливает лестницу/);
    assert.match(v.message, /could not fix everything/);
    // a later gate (format) still ran and passed — the ladder was not halted by this failure
    assert.match(v.message, /✅ format/);
  });

  it('a passing mutating rung is marked with 🔧, not ✅', () => {
    const results = baseResults(['format:fix', 'format']);
    const v = verdict(results);
    assert.strictEqual(v.ok, true);
    if (!v.ok) return;
    assert.match(v.text, /🔧 format:fix \(\d+\.\d+s\) — мутирующий шаг/);
    assert.match(v.text, /✅ format \(\d+\.\d+s\)/);
  });

  it('a skipped rung is neither ✅ nor ❌ — an honest ⏭ line, and does not fail the run', () => {
    const results: GateResult[] = [
      ...baseResults(['type-check']),
      {
        name: 'format:fix',
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
    assert.match(v.text, /⏭ format:fix — скрипта нет в package\.json, пропущено/);
    assert.doesNotMatch(v.text, /❌ format:fix/);
    assert.doesNotMatch(v.text, /✅ format:fix/);
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
      ranCommand: r.name === 'yagni' ? 'npx tsx cli/gennady.ts yagni' : r.ranCommand,
    }));
    const v = verdict(results);
    assert.strictEqual(v.ok, false);
    if (v.ok) return;
    assert.match(v.message, /❌ yagni — exit 1 \(ran: npx tsx cli\/gennady\.ts yagni\)/);
    assert.match(
      v.message,
      /… output truncated to last 120 lines — full transcript: npx tsx cli\/gennady\.ts yagni/
    );
  });
});

describe('profiles', () => {
  it('gatesFor subsets GATES in canonical ladder order per profile — exact arrays', () => {
    assert.deepStrictEqual(
      gatesFor('setup').map((g) => g.name),
      ['type-check', 'test', 'format:fix', 'lint:fix', 'lint', 'format']
    );
    assert.deepStrictEqual(
      gatesFor('code').map((g) => g.name),
      ['type-check', 'test', 'format:fix', 'lint:fix', 'lint', 'format']
    );
    assert.deepStrictEqual(
      gatesFor('test').map((g) => g.name),
      ['type-check', 'test:coverage', 'format:fix', 'format']
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

  it('test profile does not run lint (no production code changed) and does not check a coverage threshold — sdd-verify only reports test:coverage exit code, it never reads a % number', () => {
    const names = gatesFor('test').map((g) => g.name);
    assert.ok(!names.includes('lint'));
    assert.ok(!names.includes('lint:fix'));
    assert.ok(names.includes('test:coverage'));
  });

  it('isProfile guards CLI input', () => {
    assert.ok(isProfile('setup') && isProfile('code') && isProfile('test') && isProfile('full'));
    assert.ok(!isProfile('all') && !isProfile(''));
  });
});

describe('run — ladder halting on a broken foundation', () => {
  it('type-check failure stops the ladder — nothing after it runs', async () => {
    const { runner, calls } = fakeRunner(['type-check']);
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, ['npm run type-check']);
    if (!o.ok) {
      assert.match(o.message, /лестница остановлена на «type-check»/);
    }
  });

  it('test failure (code/setup profile) stops the ladder — no repair or quality rungs run', async () => {
    const { runner, calls } = fakeRunner(['test']);
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, ['npm run type-check', 'npm run test']);
    if (!o.ok) {
      assert.match(o.message, /лестница остановлена на «test»/);
    }
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

  it('a failing repair rung (format:fix) does not halt — later rungs still run', async () => {
    const { runner, calls } = fakeRunner(['format:fix']);
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, false); // still a failure overall
    assert.deepStrictEqual(calls, [
      'npm run type-check',
      'npm run test',
      'npm run format:fix',
      'npm run lint:fix',
      'npm run lint',
      'npm run format',
    ]);
    if (!o.ok) {
      assert.doesNotMatch(o.message, /лестница остановлена/);
      assert.match(o.message, /🔧 format:fix — exit 1/);
    }
  });

  it('a failing quality rung (lint) does not halt — format still runs after it', async () => {
    const { runner, calls } = fakeRunner(['lint']);
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, false);
    assert.ok(calls.includes('npm run format'));
    assert.strictEqual(calls.length, 6);
  });
});

describe('run — skipping a missing npm script', () => {
  it('a step whose npm script is absent is skipped honestly, not treated as a failure', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'type-check': 'tsc', test: 'node --test', format: 'prettier --check .' },
      // no format:fix declared
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    // format:fix, lint:fix, lint were never called — no matching scripts
    assert.deepStrictEqual(calls, ['npm run type-check', 'npm run test', 'npm run format']);
    if (o.ok) {
      assert.match(o.text, /⏭ format:fix — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /⏭ lint:fix — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /⏭ lint — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /ALL PASS/);
    }
  });

  it('setup profile: a missing foundation rung is still an honest skip — setup runs before the infrastructure exists', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { format: 'prettier --check .' },
      // no type-check / test declared — legal for setup, and only for setup
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'setup');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, ['npm run format']);
    if (o.ok) {
      assert.match(o.text, /⏭ type-check — скрипта нет в package\.json, пропущено/);
      assert.match(o.text, /⏭ test — скрипта нет в package\.json, пропущено/);
    }
  });
});

describe('run — required rungs refuse to skip (code/test/full)', () => {
  it('test profile without type-check → red ⛔ verdict, nothing later runs', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'test:coverage': 'c8 node --test', format: 'prettier --check .' },
      // no type-check declared — required for the test profile
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'test');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, []); // the ladder stopped before running anything
    if (o.ok) return;
    assert.match(o.message, /⛔ type-check — обязательная ступень профиля «test»/);
    assert.match(o.message, /скрипта нет в package\.json/);
    assert.match(o.message, /GATE_QUEUE/);
  });

  it('code profile without test → red, after type-check has already run', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'type-check': 'tsc', format: 'prettier --check .' },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    assert.deepStrictEqual(calls, ['npm run type-check']);
    if (o.ok) return;
    assert.match(o.message, /⛔ test — обязательная ступень профиля «code»/);
  });

  it('a quality rung is required too — code without lint is red, not a green pass that dropped lint (B3)', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: { 'type-check': 'tsc', test: 'node --test', format: 'prettier --check .' },
      // no lint declared — now a required rung for the code profile
    });
    const { runner } = fakeRunner();
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.match(o.message, /⛔ lint — обязательная ступень профиля «code»/);
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
        'type-check': 'tsc',
        test: "echo 'TODO: настроить инфраструктуру (test runner)' >&2",
        format: 'prettier --check .',
      },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    assert.ok(!calls.includes('npm run test'), 'a stub must never be run and counted as pass');
    if (o.ok) return;
    assert.match(o.message, /⛔ test — обязательная ступень профиля «code»/);
    assert.match(o.message, /заглушка \(no-op\)/);
  });

  it('a required script whose exit code is silenced (`|| true`) is refused, and the reason says so', async () => {
    currentPkgJson = JSON.stringify({
      name: 'gennady',
      scripts: {
        'type-check': 'tsc --noEmit',
        test: 'node --test || true',
        format: 'prettier --check .',
      },
    });
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    assert.ok(!calls.includes('npm run test'));
    if (o.ok) return;
    assert.match(o.message, /⛔ test — обязательная ступень профиля «code»/);
    assert.match(o.message, /заглушён exit code/);
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
    const o = await run(runner, 'code');
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
    // No coverage/ dir, no fresh artifact — sdd-verify does NOT care: it only ran the report step.
    coverageDirExists = false;
    const { runner } = fakeRunner();
    const o = await run(runner, 'full');
    assert.strictEqual(o.ok, true, o.ok ? '' : o.message);
  });
});

describe('run — foundation re-run after real mutations', () => {
  it('a repair rung that changed the tree triggers exactly one read-only re-run of the foundation', async () => {
    rootFiles = ['a.ts'];
    const calls: string[] = [];
    const runner: GateRunner = (command, args) => {
      const cmd = `${command} ${args.join(' ')}`;
      calls.push(cmd);
      if (cmd === 'npm run format:fix') currentMtimeMs += 1000; // the fixer actually rewrote a file
      return { exitCode: 0, output: '' };
    };
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, true);
    assert.deepStrictEqual(calls, [
      'npm run type-check',
      'npm run test',
      'npm run format:fix',
      'npm run lint:fix',
      'npm run lint',
      'npm run format',
      'npm run type-check', // re-run over the repaired state
      'npm run test',
    ]);
    if (o.ok) {
      assert.match(o.text, /type-check \(re-run после мутаций\)/);
      assert.match(o.text, /test \(re-run после мутаций\)/);
    }
  });

  it('repair rungs that changed nothing → no re-run, no wasted test time', async () => {
    rootFiles = ['a.ts'];
    const { runner, calls } = fakeRunner();
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, true);
    assert.strictEqual(calls.filter((c) => c === 'npm run test').length, 1);
    assert.strictEqual(calls.filter((c) => c === 'npm run type-check').length, 1);
  });

  it('a re-run failure is a red verdict — the repaired state is what gets judged', async () => {
    rootFiles = ['a.ts'];
    let typeCheckRuns = 0;
    const runner: GateRunner = (command, args) => {
      const cmd = `${command} ${args.join(' ')}`;
      if (cmd === 'npm run format:fix') currentMtimeMs += 1000;
      if (cmd === 'npm run type-check' && ++typeCheckRuns === 2) {
        return { exitCode: 2, output: 'TS2345 broken by autofix' };
      }
      return { exitCode: 0, output: '' };
    };
    const o = await run(runner, 'code');
    assert.strictEqual(o.ok, false);
    if (o.ok) return;
    assert.match(o.message, /type-check \(re-run после мутаций\) — exit 2/);
    assert.match(o.message, /broken by autofix/);
  });
});

describe('parseInvocation', () => {
  // parseArgs (shared/common/parse-args.ts) keeps process.argv[2] — the command token itself —
  // inside `_`, so every case below prefixes argv with the real `node script sdd-verify` shape.
  const argv = (...rest: string[]): string[] => ['node', 'gennady.ts', 'sdd-verify', ...rest];

  it('no flags → defaults to the full profile', () => {
    const r = parseInvocation(argv());
    assert.deepStrictEqual(r, { ok: true, profile: 'full' });
  });

  it('--profile <value> and --profile=<value> both resolve the profile', () => {
    assert.deepStrictEqual(parseInvocation(argv('--profile', 'code')), {
      ok: true,
      profile: 'code',
    });
    assert.deepStrictEqual(parseInvocation(argv('--profile=test')), {
      ok: true,
      profile: 'test',
    });
  });

  it('a bare path — the exact real-world defect (a worker appending a target file) — is a hard error, not a silently ignored no-op', () => {
    const r = parseInvocation(argv('--profile', 'code', 'ai/kit/lazy-assembly.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /unexpected path argument\(s\): ai\/kit\/lazy-assembly\.ts/);
    assert.match(r.message, /whole project/i);
    assert.match(r.message, /npx gennady lint --spec=<module-spec> <paths>/);
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

  it('an unknown --profile value is a bad invocation naming the accepted set', () => {
    const r = parseInvocation(argv('--profile', 'bogus'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /unknown --profile 'bogus'/);
  });

  it('bad-invocation message always carries the usage line', () => {
    const r = parseInvocation(argv('stray.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /usage: npx gennady sdd-verify \[--profile <setup\|code\|test\|full>]/);
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
      'npx tsx cli/gennady.ts yagni',
    ]);
  });

  it('consumer project (package.json name ≠ gennady) → calls npx gennady <gate> unchanged', async () => {
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
      'npx gennady yagni',
    ]);
  });

  it('a failing gennady gate names the actual command it ran, in both modes', async () => {
    currentPkgJson = JSON.stringify({ name: 'gennady', scripts: ALL_SCRIPTS });
    const selfHosted = await run(fakeRunner(['yagni']).runner, 'full');
    assert.strictEqual(selfHosted.ok, false);
    if (!selfHosted.ok) {
      assert.match(selfHosted.message, /❌ yagni — exit 1 \(ran: npx tsx cli\/gennady\.ts yagni\)/);
    }

    currentPkgJson = JSON.stringify({ name: 'some-consumer-app', scripts: ALL_SCRIPTS });
    const consumer = await run(fakeRunner(['yagni']).runner, 'full');
    assert.strictEqual(consumer.ok, false);
    if (!consumer.ok) {
      assert.match(consumer.message, /❌ yagni — exit 1 \(ran: npx gennady yagni\)/);
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
      'npx tsx cli/gennady.ts yagni', // self-hosting default set in beforeEach
    ]);
  });

  it('RUN-ALL past the foundation: a quality-rung failure keeps running and exits 1', async () => {
    const { runner, calls } = fakeRunner(['lint']);
    const o = await run(runner);
    assert.strictEqual(o.ok === false && o.exitCode, 1);
    assert.strictEqual(calls.length, 5);
  });
});
