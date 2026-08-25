// @file: Real-toolchain e2e — the ONE test in the suite that wires the ACTUAL binaries (tsc,
//   node --test, c8, prettier) and local gennady (via tsx) behind sdd-verify's gate ladder, then
//   proves a GENUINE defect turns the ladder red. Every other tool-behavior test uses scripted
//   `node -e process.exit(N)` stand-ins, which prove the ladder's LOGIC but never that a real type
//   error, a real failing assertion, real unformatted code, or a real coverage shortfall is caught.
//   This closes that gap. Gated behind GENNADY_E2E=1 (slow: real tsc/c8 cold starts) so it runs only
//   under `npm run test:e2e`, never the commit gate.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRepoFixture } from '../tool-behavior/fixture.ts';
import { runCli } from '../tool-behavior/run-cli.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BIN = join(REPO_ROOT, 'node_modules', '.bin');
const TSX = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const GENNADY = join(REPO_ROOT, 'cli', 'gennady.ts');

/** A prettier-clean, DbC-valid production module the real toolchain type-checks, tests, lints, and covers. */
const THING = [
  '// @file: Fixture production module.',
  '// @consumers: N/A',
  '// @tasks: N/A',
  '',
  '/**',
  ' * @purpose Add two numbers.',
  ' * @param a First addend.',
  ' * @param b Second addend.',
  ' * @returns The sum.',
  ' */',
  'export function add(a: number, b: number): number {',
  '  return a + b;',
  '}',
  '',
].join('\n');

/** A real `node:test` file that genuinely exercises `add` — 100% line coverage of THING. */
const THING_TEST = [
  '// @file: Fixture test.',
  '// @consumers: N/A',
  '// @tasks: N/A',
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { add } from './thing.ts';",
  "test('add', () => {",
  '  assert.strictEqual(add(2, 3), 5);',
  '});',
  '',
].join('\n');

/**
 * @purpose package.json scripts wired to the repo's REAL binaries (absolute paths — the fixture temp
 *   dir has no node_modules of its own), so each sdd-verify gate runs the genuine tool.
 * @param withFormatFix Include the mutating `format:fix` (prettier --write) repair step. Omit it to
 *   test that the read-only `format` CHECK catches a real violation the ladder would otherwise heal.
 * @returns The scripts map for buildRepoFixture.
 */
function realScripts(withFormatFix: boolean): Record<string, string> {
  return {
    'type-check': `"${BIN}/tsc" --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/thing.ts`,
    test: `node --import "${TSX}" --test src/thing.test.ts`,
    'test:coverage': `"${BIN}/c8" --reporter=text-summary --check-coverage --lines=80 node --import "${TSX}" --test src/thing.test.ts`,
    format: `"${BIN}/prettier" --check "src/**/*.ts"`,
    ...(withFormatFix ? { 'format:fix': `"${BIN}/prettier" --write "src/**/*.ts"` } : {}),
    lint: `node --import "${TSX}" "${GENNADY}" lint src/thing.ts`,
  };
}

/**
 * @purpose Build a fixture repo whose gates are the real toolchain, seeded with the given source.
 * @param files Source files to write under the fixture root.
 * @param withFormatFix Whether to include the mutating format repair step.
 * @returns The fixture's absolute root.
 */
function realFixture(files: Record<string, string>, withFormatFix = true): string {
  const { root } = buildRepoFixture({
    scripts: realScripts(withFormatFix),
    gennadyInstalled: true,
    directives: true,
    files,
  });
  return root;
}

const isE2eRun = process.env.GENNADY_E2E === '1';

if (isE2eRun) {
  describe('real-toolchain e2e — genuine defects turn the ladder red', () => {
    it('GREEN: real tsc + node --test + gennady lint + prettier all pass → ALL PASS, exit 0', () => {
      const root = realFixture({ 'src/thing.ts': THING, 'src/thing.test.ts': THING_TEST });
      try {
        const r = runCli(['sdd-verify', '--profile', 'code'], root);
        assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /ALL PASS/);
        assert.match(r.stdout, /✅ type-check/);
        assert.match(r.stdout, /✅ test\b/);
        assert.match(r.stdout, /✅ lint\b/);
        assert.match(r.stdout, /✅ format\b/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('a REAL type error (string returned where number is declared) halts the ladder at type-check', () => {
      const root = realFixture({
        'src/thing.ts': THING.replace('return a + b;', "return a + b + '';"),
        'src/thing.test.ts': THING_TEST,
      });
      try {
        const r = runCli(['sdd-verify', '--profile', 'code'], root);
        assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /❌ type-check/);
        // Not a scripted exit code — the genuine tsc diagnostic reaches the operator.
        assert.match(r.stdout, /TS2322/);
        assert.match(r.stdout, /⛔ лестница остановлена на «type-check»/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('a REAL failing assertion (add(2,3) expected 6) halts the ladder at test', () => {
      const root = realFixture({
        'src/thing.ts': THING,
        'src/thing.test.ts': THING_TEST.replace('add(2, 3), 5', 'add(2, 3), 6'),
      });
      try {
        const r = runCli(['sdd-verify', '--profile', 'code'], root);
        assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /✅ type-check/);
        assert.match(r.stdout, /❌ test\b/);
        assert.match(r.stdout, /⛔ лестница остановлена на «test»/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('REAL unformatted code (no format:fix to heal it) fails the read-only format gate', () => {
      const root = realFixture(
        {
          'src/thing.ts': THING.replace('  return a + b;', '  return    a+b;'),
          'src/thing.test.ts': THING_TEST,
        },
        false
      );
      try {
        const r = runCli(['sdd-verify', '--profile', 'code'], root);
        assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /✅ type-check/);
        assert.match(r.stdout, /❌ format\b/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('a REAL coverage shortfall (uncovered branches below --lines=80) halts --profile test at test:coverage', () => {
      // A large unexercised function — the test covers only `add`, so real c8 lands far below the
      // --lines=80 threshold (≈48% measured), a wide margin that survives context differences.
      const uncoveredBody = Array.from(
        { length: 20 },
        (_, i) => `  if (n === ${i}) return ${i} * 2;`
      ).join('\n');
      const uncovered =
        THING +
        [
          '',
          '/**',
          ' * @purpose A large unexercised map — deliberately left uncovered to sink line coverage.',
          ' * @param n Input value.',
          ' * @returns A mapped value.',
          ' */',
          'export function untested(n: number): number {',
          uncoveredBody,
          '  return -1;',
          '}',
          '',
        ].join('\n');
      const root = realFixture({ 'src/thing.ts': uncovered, 'src/thing.test.ts': THING_TEST });
      try {
        const r = runCli(['sdd-verify', '--profile', 'test'], root);
        assert.notStrictEqual(r.exitCode, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /✅ type-check/);
        assert.match(r.stdout, /❌ test:coverage/);
        // The real c8 threshold message, not a scripted failure.
        assert.match(r.stdout, /threshold/i);
        assert.match(r.stdout, /⛔ лестница остановлена на «test:coverage»/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // The scoped-coverage chain the unit tests can't exercise: `sdd-verify --profile test` is the
  // SINGLE owner of the coverage run (real c8 writes coverage-final.json), then a SEPARATE
  // `testcov --min <files>` READS that fresh report and gates the threshold over the task's own
  // Target Files — no second suite run. Two production files (`covered.ts` fully hit, `partial.ts`
  // mostly unhit) prove real multi-file scoping over a genuine c8 report.
  describe('real-toolchain e2e — sdd-verify writes coverage, scoped testcov reads it', () => {
    const COVERED = [
      '// @file: Fully-covered production unit.',
      '// @consumers: N/A',
      '// @tasks: N/A',
      '',
      '/**',
      ' * @purpose Double a number.',
      ' * @param a The input.',
      ' * @returns Twice a.',
      ' */',
      'export function covered(a: number): number {',
      '  return a * 2;',
      '}',
      '',
    ].join('\n');
    const PARTIAL = [
      '// @file: Barely-exercised production unit — most branches never run.',
      '// @consumers: N/A',
      '// @tasks: N/A',
      '',
      '/**',
      ' * @purpose Map a number through many unexercised branches.',
      ' * @param n The input.',
      ' * @returns A mapped value.',
      ' */',
      'export function partial(n: number): number {',
      ...Array.from({ length: 20 }, (_, i) => `  if (n === ${i}) return ${i} * 3;`),
      '  return -1;',
      '}',
      '',
    ].join('\n');
    // Imports both, but only fully exercises `covered` — `partial` is loaded (so c8 reports it) yet
    // its branches stay unhit.
    const CHAIN_TEST = [
      '// @file: Exercises covered fully, partial minimally.',
      '// @consumers: N/A',
      '// @tasks: N/A',
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { covered } from './covered.ts';",
      "import { partial } from './partial.ts';",
      "test('covered + partial', () => {",
      '  assert.strictEqual(covered(2), 4);',
      '  assert.strictEqual(partial(0), 0);',
      '});',
      '',
    ].join('\n');

    /** Scripts where test:coverage only PRODUCES the report (c8 json) — the threshold is testcov's job. */
    function chainScripts(): Record<string, string> {
      return {
        'type-check': `"${BIN}/tsc" --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/covered.ts src/partial.ts`,
        'test:coverage': `"${BIN}/c8" --reporter=json --reporter=text-summary node --import "${TSX}" --test src/test.test.ts`,
      };
    }
    function chainFixture(): string {
      const { root } = buildRepoFixture({
        scripts: chainScripts(),
        gennadyInstalled: true,
        directives: true,
        files: {
          'src/covered.ts': COVERED,
          'src/partial.ts': PARTIAL,
          'src/test.test.ts': CHAIN_TEST,
        },
      });
      return root;
    }

    it('the gate produces coverage/, then scoped testcov reads it — all Target Files gated, no re-run', () => {
      const root = chainFixture();
      try {
        // 1) The phase gate is the single owner of the coverage run — it writes a fresh coverage/.
        const gate = runCli(['sdd-verify', '--profile', 'test'], root);
        assert.strictEqual(gate.exitCode, 0, gate.stdout + gate.stderr);
        assert.match(gate.stdout, /✅ test:coverage/);

        // 2) Scoped over BOTH Target Files → the unhit partial.ts drags the aggregate below 80 → fail.
        const both = runCli(['testcov', '--min=80', 'src/covered.ts', 'src/partial.ts'], root);
        assert.strictEqual(both.exitCode, 1, both.stdout + both.stderr);
        assert.match(both.stdout, /required ≥80% ❌/);

        // 3) Scoped over the fully-covered file alone → passes. Same report, no second suite run.
        const one = runCli(['testcov', '--min=80', 'src/covered.ts'], root);
        assert.strictEqual(one.exitCode, 0, one.stdout + one.stderr);
        assert.match(one.stdout, /required ≥80% ✅/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
}
