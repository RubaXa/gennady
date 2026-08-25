// @file: Live-CLI behavior of `testcov --min` — a real run against a synthetic coverage-final.json
//   with one 100%-covered file and one 0%-covered file, checked both scoped-to-a-path and aggregated
//   project-wide.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

/** @purpose Two trivial TS source files with the same statement count — one fully hit, one never hit. */
const GOOD_TS = ['export function good(): number {', '  return 1;', '}', ''].join('\n');
const BAD_TS = ['export function bad(): number {', '  return 2;', '}', ''].join('\n');

// Minimal Istanbul-shaped entries, keyed by basename — testcov's `getCovRaw` falls back to a
// basename match when the exact absolute path is not the key, so the fixture never needs to know
// its own eventual absolute path up front. Only `s` (statement hit counts) is read by --min.
const COVERAGE = {
  'good.ts': { s: { '0': 1, '1': 1 }, b: {}, f: {} },
  'bad.ts': { s: { '0': 0, '1': 0 }, b: {}, f: {} },
};

describe('testcov — live --min coverage gate', () => {
  function buildFixture(): { root: string } {
    return buildRepoFixture({
      scripts: {},
      files: {
        'src/good.ts': GOOD_TS,
        'src/bad.ts': BAD_TS,
        'coverage/coverage-final.json': JSON.stringify(COVERAGE, null, 2),
      },
    });
  }

  it('a fully-covered file passes --min=80', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80', 'src/good.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0% .* required ≥80% ✅/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a never-covered file fails --min=80', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80', 'src/bad.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /0\.0% .* required ≥80% ❌/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with no path, the two files aggregate to 50% and fail --min=80', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /50\.0% .* required ≥80% ❌/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Critical-1a: MULTIPLE Target Files must ALL be gated. The old code took only positional[0], so
  // `--min=80 good.ts bad.ts` measured just good.ts (100%) and passed — the uncovered bad.ts slipped
  // through. Now both aggregate to 50% and the gate correctly fails.
  it('several paths ALL count — good.ts + bad.ts aggregate to 50% and fail --min=80', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80', 'src/good.ts', 'src/bad.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /50\.0% .* required ≥80% ❌/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('several paths that are all covered pass — good.ts twice aggregates to 100%', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80', 'src/good.ts', 'src/good.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0% .* required ≥80% ✅/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // #3: the gate demands EXACT paths — a missing Target File is red, never silently dropped because
  // a sibling with the same basename was found elsewhere.
  it('a missing path among several is red — no basename fallback, no silent drop', () => {
    const { root } = buildFixture();
    try {
      const r = runCli(['testcov', '--min=80', 'src/good.ts', 'src/nope.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr + r.stdout, /не найдены|nope\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // #2: a report OLDER than the code it gates is stale — the single-producer contract is only real
  // if the report is fresh. A source touched after the report must go red, not pass on stale data.
  it('a stale coverage report (source newer than the report) is red', () => {
    const { root } = buildFixture();
    try {
      // Make good.ts newer than coverage-final.json (simulate code changed after the last run).
      const cov = join(root, 'coverage', 'coverage-final.json');
      const covMtime = statSync(cov).mtimeMs / 1000;
      const newer = new Date((covMtime + 5) * 1000);
      utimesSync(join(root, 'src', 'good.ts'), newer, newer);

      const r = runCli(['testcov', '--min=80', 'src/good.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr + r.stdout, /устарел|изменены ПОСЛЕ/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a fresh report (report newer than sources) passes the freshness check', () => {
    const { root } = buildFixture();
    try {
      // coverage-final.json is written last by buildRepoFixture, so it is already the newest.
      const r = runCli(['testcov', '--min=80', 'src/good.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /required ≥80% ✅/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
