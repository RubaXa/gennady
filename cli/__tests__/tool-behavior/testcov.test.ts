// @file: Live-CLI behavior of `testcov --min` — a real run against a synthetic coverage-final.json
//   with one 100%-covered file and one 0%-covered file, checked both scoped-to-a-path and aggregated
//   project-wide.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
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
});
