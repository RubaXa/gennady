// @file: Integration tests for testcov.cmd.ts's --check diagnostics — spawned as a subprocess since
//   the command file is a top-level script (no exported `run`), so behavior is observed via stdio/exit.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  realpathSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const CMD = resolve(import.meta.dirname, '..', 'testcov.cmd.ts');
// cli/cmd/testcov/__tests__ → repo root, 4 levels up — needed to symlink node_modules into each
// fixture dir so `node --import tsx` resolves `tsx` from the fixture's own cwd (module resolution
// is cwd-relative; a bare temp dir with no node_modules can't find it).
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

let dir: string;

function runCheck(cwd: string): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(process.execPath, ['--import', 'tsx', CMD, '--check', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

describe('testcov --check', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'testcov-'));
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports NATIVE_COVERAGE_UNSUPPORTED (not a silent NO_RUNNER) for a native node --test --experimental-test-coverage script with no c8', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        scripts: {
          'test:coverage': 'node --test --experimental-test-coverage test/**/*.test.ts',
        },
      }),
      'utf-8'
    );
    const { stdout, status } = runCheck(dir);
    assert.strictEqual(status, 1);
    const parsed = JSON.parse(stdout) as { diagnostics: Array<{ code: string; fix: string }> };
    const diag = parsed.diagnostics.find((d) => d.code === 'NATIVE_COVERAGE_UNSUPPORTED');
    assert.ok(
      diag,
      `expected NATIVE_COVERAGE_UNSUPPORTED, got: ${JSON.stringify(parsed.diagnostics)}`
    );
    assert.match(diag!.fix, /native node coverage found; install c8 for testcov integration/);
    // must not fall back to the generic (misleading) NO_RUNNER code
    assert.ok(!parsed.diagnostics.some((d) => d.code === 'NO_RUNNER'));
  });

  it('still reports plain NO_RUNNER when no runner and no native-coverage script exist', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', scripts: { build: 'tsc' } }),
      'utf-8'
    );
    const { stdout, status } = runCheck(dir);
    assert.strictEqual(status, 1);
    const parsed = JSON.parse(stdout) as { diagnostics: Array<{ code: string }> };
    assert.ok(parsed.diagnostics.some((d) => d.code === 'NO_RUNNER'));
    assert.ok(!parsed.diagnostics.some((d) => d.code === 'NATIVE_COVERAGE_UNSUPPORTED'));
  });

  it('picks c8 + node --test over reporting native-coverage-unsupported when both are present', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        devDependencies: { c8: '^9.0.0' },
        scripts: { test: 'node --test --experimental-test-coverage test/**/*.test.ts' },
      }),
      'utf-8'
    );
    const { stdout } = runCheck(dir);
    const parsed = JSON.parse(stdout) as { runner: string | null };
    assert.strictEqual(parsed.runner, 'node:test');
  });

  describe('vitest config lookup also checks vite.config.* for a `test:` block', () => {
    it('a vite.config.ts carrying test.coverage is recognized — no NO_RUNNER_CONFIG, no reporter/reportOnFailure warnings', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'fixture', devDependencies: { vitest: '^2.0.0' } }),
        'utf-8'
      );
      writeFileSync(
        join(dir, 'vite.config.ts'),
        [
          'export default {',
          '  test: {',
          "    coverage: { reporter: ['json', 'text'], reportOnFailure: true },",
          '  },',
          '};',
        ].join('\n'),
        'utf-8'
      );
      try {
        const { stdout } = runCheck(dir);
        const parsed = JSON.parse(stdout) as { diagnostics: Array<{ code: string }> };
        assert.ok(!parsed.diagnostics.some((d) => d.code === 'NO_RUNNER_CONFIG'));
        assert.ok(!parsed.diagnostics.some((d) => d.code === 'MISSING_JSON_REPORTER'));
        assert.ok(!parsed.diagnostics.some((d) => d.code === 'MISSING_REPORT_ON_FAILURE'));
        assert.ok(!parsed.diagnostics.some((d) => d.code === 'REPORT_ON_FAILURE_DISABLED'));
      } finally {
        unlinkSync(join(dir, 'vite.config.ts'));
      }
    });

    it('no vitest.config.* and no vite.config.* at all → the prior NO_RUNNER_CONFIG warning, wording naming both', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'fixture', devDependencies: { vitest: '^2.0.0' } }),
        'utf-8'
      );
      const { stdout } = runCheck(dir);
      const parsed = JSON.parse(stdout) as {
        diagnostics: Array<{ code: string; message: string }>;
      };
      const diag = parsed.diagnostics.find((d) => d.code === 'NO_RUNNER_CONFIG');
      assert.ok(diag, `expected NO_RUNNER_CONFIG, got: ${JSON.stringify(parsed.diagnostics)}`);
      assert.match(diag!.message, /vitest\.config\.\*/);
      assert.match(diag!.message, /vite\.config\.\*/);
    });
  });
});

describe('testcov --min', () => {
  let minDir: string;

  function runMin(args: string[]): { stdout: string; stderr: string; status: number | null } {
    const res = spawnSync(process.execPath, ['--import', 'tsx', CMD, ...args], {
      cwd: minDir,
      encoding: 'utf-8',
    });
    return { stdout: res.stdout, stderr: res.stderr, status: res.status };
  }

  before(() => {
    // realpathSync: on macOS mkdtempSync can return a path through a symlinked tmp root (e.g.
    // /tmp -> /private/tmp); the command resolves `resolve(process.cwd())` for its ROOT, so the
    // fixture's coverage-final.json keys must be built from the same canonical path or lookups miss.
    minDir = realpathSync(mkdtempSync(join(tmpdir(), 'testcov-min-')));
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(minDir, 'node_modules'), 'dir');
    mkdirSync(join(minDir, 'good'), { recursive: true });
    mkdirSync(join(minDir, 'bad'), { recursive: true });
    writeFileSync(join(minDir, 'good', 'a.ts'), 'export const a = 1;\n', 'utf-8');
    writeFileSync(join(minDir, 'bad', 'b.ts'), 'export const b = 2;\n', 'utf-8');

    const aPath = join(minDir, 'good', 'a.ts');
    const bPath = join(minDir, 'bad', 'b.ts');
    const statementMap = { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } } };
    const coverage = {
      [aPath]: {
        path: aPath,
        statementMap,
        s: { '0': 1 }, // fully covered
        branchMap: {},
        b: {},
        fnMap: {},
        f: {},
      },
      [bPath]: {
        path: bPath,
        statementMap,
        s: { '0': 0 }, // never hit
        branchMap: {},
        b: {},
        fnMap: {},
        f: {},
      },
    };
    mkdirSync(join(minDir, 'coverage'), { recursive: true });
    writeFileSync(
      join(minDir, 'coverage', 'coverage-final.json'),
      JSON.stringify(coverage),
      'utf-8'
    );
  });

  after(() => {
    rmSync(minDir, { recursive: true, force: true });
  });

  it('без позиционного пути агрегирует весь проект: good (100%) + bad (0%) = 50%', () => {
    const { stdout, status } = runMin(['--min=60']);
    assert.match(stdout, /50\.0%/);
    assert.match(stdout, /1\/2 statements/);
    assert.strictEqual(status, 1);
  });

  it('с позиционным путем "good" считает порог только по этому пути — 100%, порог 60% проходит', () => {
    const { stdout, status } = runMin(['--min=60', 'good']);
    assert.match(stdout, /100\.0%/);
    assert.match(stdout, /1\/1 statements/);
    assert.strictEqual(status, 0);
  });

  it('с позиционным путем "bad" считает порог только по этому пути — 0%, порог 60% не проходит', () => {
    const { stdout, status } = runMin(['--min=60', 'bad']);
    assert.match(stdout, /0\.0%/);
    assert.match(stdout, /0\/1 statements/);
    assert.strictEqual(status, 1);
  });

  it('несуществующий позиционный путь → красный, exit 1 (exact-разрешение, не молча агрегирует весь проект)', () => {
    const { stderr, status } = runMin(['--min=60', 'no-such-dir']);
    assert.match(stderr, /не найдены по указанному пути: no-such-dir/);
    assert.strictEqual(status, 1);
  });

  it('несуществующий путь СРЕДИ существующих → красный (не теряется молча) — exact-разрешение', () => {
    const { stderr, status } = runMin(['--min=60', 'good', 'no-such-dir']);
    assert.match(stderr, /не найдены по указанному пути: no-such-dir/);
    assert.strictEqual(status, 1);
  });
});
