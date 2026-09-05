// @file: Live-CLI behavior of `testcov --min` — a real run against a synthetic coverage-final.json
//   with one 100%-covered file and one 0%-covered file, checked both scoped-to-a-path and aggregated
//   project-wide.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, utimesSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

/** @purpose Two trivial TS source files with the same statement count — one fully hit, one never hit. */
const GOOD_TS = ['export function good(): number {', '  return 1;', '}', ''].join('\n');
const BAD_TS = ['export function bad(): number {', '  return 2;', '}', ''].join('\n');

/** @purpose Minimal Istanbul entry; only hit counts are read by the threshold gate. */
function coverageEntry(hit: number): { s: Record<string, number>; b: {}; f: {} } {
  return { s: { '0': hit, '1': hit }, b: {}, f: {} };
}

// Repo-relative keys are an exact identity form. Container paths are covered separately below.
const COVERAGE = {
  'src/good.ts': coverageEntry(1),
  'src/bad.ts': coverageEntry(0),
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

  it('project-wide includes root-level production files instead of only top-level directories', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'root.ts': BAD_TS,
        'src/good.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          'root.ts': coverageEntry(0),
          'src/good.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=80'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /50\.0% .* required ≥80% ❌/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('project-wide is red when an arbitrarily deep production file is absent from the report', () => {
    const deep = 'src/one/two/three/four/five/six/unreported.ts';
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/good.ts': GOOD_TS,
        [deep]: BAD_TS,
        'coverage/coverage-final.json': JSON.stringify({ 'src/good.ts': coverageEntry(1) }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=80'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /coverage identity не найдена.*unreported\.ts/);
      assert.doesNotMatch(r.stdout, /100\.0% .* ✅/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('scoped directory is red when any nested production file is absent from the report', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/good.ts': GOOD_TS,
        'src/nested/unreported.ts': BAD_TS,
        'coverage/coverage-final.json': JSON.stringify({ 'src/good.ts': coverageEntry(1) }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=80', 'src'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /coverage identity не найдена.*src\/nested\/unreported\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('complete project-wide source-set stays within a bounded performance envelope', () => {
    const files: Record<string, string> = {};
    const coverage: Record<string, ReturnType<typeof coverageEntry>> = {};
    for (let index = 0; index < 250; index++) {
      const path = `src/deep/${index}/feature.ts`;
      files[path] = GOOD_TS;
      coverage[path] = coverageEntry(1);
    }
    files['coverage/coverage-final.json'] = JSON.stringify(coverage);
    const { root } = buildRepoFixture({ scripts: {}, files });
    try {
      const started = performance.now();
      const r = runCli(['testcov', '--min=100'], root);
      const elapsedMs = performance.now() - started;
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /500\/500 statements/);
      assert.ok(elapsedMs < 10_000, `250-file gate took ${elapsedMs.toFixed(0)}ms`);
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

  it('a directory target is red when a nested production source is newer than the report', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/nested/good.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          'src/nested/good.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const cov = join(root, 'coverage', 'coverage-final.json');
      const covMtime = statSync(cov).mtimeMs / 1000;
      const newer = new Date((covMtime + 5) * 1000);
      utimesSync(join(root, 'src', 'nested', 'good.ts'), newer, newer);

      const r = runCli(['testcov', '--min=80', 'src'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /устарел.*src\/nested\/good\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a directory target passes when every nested production source is older than the report', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/nested/good.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          'src/nested/good.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const cov = join(root, 'coverage', 'coverage-final.json');
      const covMtime = statSync(cov).mtimeMs / 1000;
      const older = new Date((covMtime - 5) * 1000);
      utimesSync(join(root, 'src', 'nested', 'good.ts'), older, older);

      const r = runCli(['testcov', '--min=80', 'src'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0% .* required ≥80% ✅/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a directory with no selected production files keeps the honest unmeasured diagnostic', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'docs/readme.md': '# docs\n',
        'coverage/coverage-final.json': JSON.stringify({}),
      },
    });
    try {
      const r = runCli(['testcov', '--min=0', 'docs'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /coverage not measured.*cannot check the threshold/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('two same-basename files use their complete repo-relative identity', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'src/b/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          'src/a/shared.ts': coverageEntry(0),
          'src/b/shared.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const a = runCli(['testcov', '--min=80', 'src/a/shared.ts'], root);
      const b = runCli(['testcov', '--min=80', 'src/b/shared.ts'], root);
      assert.strictEqual(a.exitCode, 1, a.stdout + a.stderr);
      assert.match(a.stdout, /0\.0%/);
      assert.strictEqual(b.exitCode, 0, b.stdout + b.stderr);
      assert.match(b.stdout, /100\.0%/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a foreign same-basename entry is not accepted as the target file', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          '/container/foreign/shared.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=0', 'src/a/shared.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /identity не найдена.*src\/a\/shared\.ts/);
      assert.match(r.stderr, /basename-only запрещён/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('several relocated roots for the same complete repo-relative path are ambiguous and red', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          '/container/one/src/a/shared.ts': coverageEntry(1),
          '/container/two/src/a/shared.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=0', 'src/a/shared.ts'], root);
      assert.strictEqual(r.exitCode, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /неоднозначная coverage identity.*src\/a\/shared\.ts/);
      assert.match(r.stderr, /\/container\/one\/src\/a\/shared\.ts/);
      assert.match(r.stderr, /\/container\/two\/src\/a\/shared\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('one relocated root matches by the unique complete repo-relative suffix', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          '/container/workspace/src/a/shared.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=80', 'src/a/shared.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0%/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a relocated Windows Istanbul key is normalized on a POSIX checkout', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': JSON.stringify({
          'C:\\workspace\\src\\a\\shared.ts': coverageEntry(1),
        }),
      },
    });
    try {
      const r = runCli(['testcov', '--min=80', 'src/a/shared.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0%/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an exact absolute coverage key wins over relocated suffix candidates', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/a/shared.ts': GOOD_TS,
        'coverage/coverage-final.json': '{}',
      },
    });
    try {
      const exact = realpathSync(join(root, 'src', 'a', 'shared.ts'));
      writeFileSync(
        join(root, 'coverage', 'coverage-final.json'),
        JSON.stringify({
          [exact]: coverageEntry(1),
          '/container/workspace/src/a/shared.ts': coverageEntry(0),
        })
      );
      const r = runCli(['testcov', '--min=80', 'src/a/shared.ts'], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /100\.0%/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('all supported production extensions aggregate across several targets', () => {
    const extensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte'];
    const files: Record<string, string> = {};
    const coverage: Record<string, ReturnType<typeof coverageEntry>> = {};
    for (const extension of extensions) {
      const path = `src/platform/file.${extension}`;
      files[path] = GOOD_TS;
      coverage[path] = coverageEntry(1);
    }
    files['coverage/coverage-final.json'] = JSON.stringify(coverage);
    const { root } = buildRepoFixture({ scripts: {}, files });
    try {
      const targets = extensions.map((extension) => `src/platform/file.${extension}`);
      const r = runCli(['testcov', '--min=100', ...targets], root);
      assert.strictEqual(r.exitCode, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /20\/20 statements/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
