// @file: Integration tests for testcov.cmd.ts diagnostics, threshold argv, and --run producer
//   ownership — spawned as a subprocess because the command is a top-level script.
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
  readFileSync,
  readdirSync,
  chmodSync,
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

  it('teaches an unsupported platform capability without falling back to Istanbul or --help', () => {
    const unknown = mkdtempSync(join(tmpdir(), 'testcov-unknown-'));
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(unknown, 'node_modules'), 'dir');
    writeFileSync(join(unknown, 'go.mod'), 'module example.test/unknown\n', 'utf-8');
    try {
      const { stdout, status } = runCheck(unknown);
      assert.strictEqual(status, 1);
      const parsed = JSON.parse(stdout) as {
        adapter: null;
        diagnostics: Array<{ code: string; message: string; fix: string }>;
      };
      assert.strictEqual(parsed.adapter, null);
      assert.strictEqual(parsed.diagnostics[0]?.code, 'ERR_CLI_TESTCOV_ADAPTER_NOT_FOUND');
      assert.match(parsed.diagnostics[0]?.message ?? '', /no coverage platform\/report adapter/);
      assert.match(parsed.diagnostics[0]?.fix ?? '', /iOS, Android, and Go are not supported yet/);
      assert.doesNotMatch(parsed.diagnostics[0]?.fix ?? '', /--help/);
    } finally {
      rmSync(unknown, { recursive: true, force: true });
    }
  });

  it('--check --json preserves machine-readable diagnostics for an unsafe adapter artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'testcov-check-link-'));
    const outside = mkdtempSync(join(tmpdir(), 'testcov-check-victim-'));
    const victim = join(outside, 'coverage-final.json');
    try {
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
      writeFileSync(victim, 'external-victim');
      symlinkSync(outside, join(root, 'coverage'), 'dir');
      const { stdout, stderr, status } = runCheck(root);
      assert.strictEqual(status, 1, stdout + stderr);
      assert.strictEqual(stderr, '');
      const parsed = JSON.parse(stdout) as {
        adapter: string;
        diagnostics: Array<{ code: string; message: string }>;
      };
      assert.strictEqual(parsed.adapter, 'istanbul-js');
      assert.strictEqual(parsed.diagnostics[0]?.code, 'ERR_CLI_TESTCOV_ARTIFACT_PATH');
      assert.match(parsed.diagnostics[0]?.message ?? '', /symlink component/);
      assert.strictEqual(readFileSync(victim, 'utf8'), 'external-victim');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
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
    assert.match(stderr, /ERR_CLI_TESTCOV_TARGET_PATH/);
    assert.match(stderr, /target `no-such-dir` is not safe coverage evidence/);
    assert.strictEqual(status, 1);
  });

  it('несуществующий путь СРЕДИ существующих → красный (не теряется молча) — exact-разрешение', () => {
    const { stderr, status } = runMin(['--min=60', 'good', 'no-such-dir']);
    assert.match(stderr, /ERR_CLI_TESTCOV_TARGET_PATH/);
    assert.match(stderr, /target `no-such-dir` is not safe coverage evidence/);
    assert.strictEqual(status, 1);
  });

  it('strict argv rejects unknown flags, missing/repeated values, boolean values, and extra interactive targets', () => {
    const invalid = [
      ['--mn=80'],
      ['-c'],
      ['--context='],
      ['-c', '0', '--context=1'],
      ['--min'],
      ['--min='],
      ['--min', '50'],
      ['--min=40', '--min=50'],
      ['--files=true'],
      ['--check', 'good'],
      ['good', 'bad'],
      ['good', 'testcov'],
    ];
    for (const args of invalid) {
      const { stderr, status } = runMin(args);
      assert.strictEqual(status, 4, `${args.join(' ')}\n${stderr}`);
      assert.match(stderr, /ERR_CLI_TESTCOV_BAD_INVOCATION/);
      assert.match(stderr, /usage: gennady testcov/);
    }
  });

  it('rejects invalid context and min numbers with exit 4 and canonical usage', () => {
    const invalid = [
      ['--context=NaN'],
      ['--context=-1'],
      ['--context=1.5'],
      ['--min=NaN'],
      ['--min=-1'],
      ['--min=100.1'],
      ['--min=Infinity'],
    ];
    for (const args of invalid) {
      const { stderr, status } = runMin(args);
      assert.strictEqual(status, 4, `${args.join(' ')}\n${stderr}`);
      assert.match(stderr, /usage: gennady testcov/);
    }
  });

  it('-c 0 consumes zero as context instead of treating it as a target', () => {
    const { stdout, stderr, status } = runMin(['good/a.ts', '-c', '0']);
    assert.strictEqual(status, 0, stderr);
    assert.match(stdout, /good\/a\.ts/);
    assert.doesNotMatch(stderr, /File not found: 0/);
  });

  it('decimal --min and multiple valid targets aggregate together', () => {
    const pass = runMin(['--min=50.0', 'good', 'bad']);
    assert.strictEqual(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /50\.0%/);
    assert.match(pass.stdout, /1\/2 statements/);

    const fail = runMin(['--min=50.1', 'good', 'bad']);
    assert.strictEqual(fail.status, 1, fail.stderr);
    assert.match(fail.stdout, /required ≥50\.1%/);
  });

  it('fails closed when an exact selected subtree cannot be enumerated', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root bypasses directory permissions — unreadable traversal is unobservable');
      return;
    }
    const blocked = join(minDir, 'blocked');
    mkdirSync(blocked, { recursive: true });
    writeFileSync(join(blocked, 'hidden.ts'), 'export const hidden = true;\n');
    chmodSync(blocked, 0o000);
    try {
      const result = runMin(['--min=80', 'blocked']);
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /ERR_CLI_TESTCOV_TRAVERSAL/);
      assert.match(result.stderr, /partial coverage aggregates are never accepted/);
    } finally {
      chmodSync(blocked, 0o700);
      rmSync(blocked, { recursive: true, force: true });
    }
  });

  it('fails closed project-wide when one source subtree is unreadable instead of reporting a partial 100%', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root bypasses directory permissions — unreadable traversal is unobservable');
      return;
    }
    const blocked = join(minDir, 'blocked');
    mkdirSync(blocked, { recursive: true });
    writeFileSync(join(blocked, 'hidden.ts'), 'export const hidden = true;\n');
    chmodSync(blocked, 0o000);
    try {
      const result = runMin(['--min=100']);
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /ERR_CLI_TESTCOV_TRAVERSAL/);
      assert.match(result.stderr, /partial coverage aggregates are never accepted/);
      assert.doesNotMatch(result.stdout, /100\.0% .* required .* ✅/);
    } finally {
      chmodSync(blocked, 0o700);
      rmSync(blocked, { recursive: true, force: true });
    }
  });
});

describe('testcov --run producer ownership', () => {
  function runProducer(
    script: string,
    environment?: (root: string) => NodeJS.ProcessEnv
  ): {
    stdout: string;
    stderr: string;
    status: number | null;
    root: string;
  } {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'testcov-run-')));
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'coverage'), { recursive: true });
    writeFileSync(join(root, 'src', 'covered.ts'), 'export const covered = true;\n', 'utf-8');
    writeFileSync(
      join(root, 'coverage', 'coverage-final.json'),
      JSON.stringify({
        'src/covered.ts': { s: { '0': 1 }, b: {}, f: {} },
      }),
      'utf-8'
    );
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        devDependencies: { c8: '^10.0.0' },
        scripts: { coverage: script },
      }),
      'utf-8'
    );
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', CMD, '--run', '--min=80', 'src/covered.ts'],
      {
        cwd: root,
        encoding: 'utf-8',
        env: { ...process.env, ...environment?.(root) },
      }
    );
    return { stdout: result.stdout, stderr: result.stderr, status: result.status, root };
  }

  it('never passes on an old 100% report when the selected producer exits nonzero', () => {
    const result = runProducer(`c8 --version && node -e "process.exit(7)" && node --test`);
    try {
      assert.strictEqual(result.status, 7, result.stdout + result.stderr);
      assert.match(result.stderr, /exited with code 7/);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked report tree without deleting the external victim or starting producer', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'testcov-run-link-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'testcov-victim-')));
    const victim = join(outside, 'coverage-final.json');
    try {
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
      writeFileSync(victim, 'external-victim');
      symlinkSync(outside, join(root, 'coverage'), 'dir');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          devDependencies: { c8: '^10.0.0' },
          scripts: { coverage: 'c8 --version && node --test' },
        })
      );
      const result = spawnSync(process.execPath, ['--import', 'tsx', CMD, '--run', '--min=80'], {
        cwd: root,
        encoding: 'utf-8',
      });
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /ERR_CLI_TESTCOV_ARTIFACT_PATH/);
      assert.match(result.stderr, /symlink component/);
      assert.strictEqual(readFileSync(victim, 'utf8'), 'external-victim');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('never passes on an old report when a successful producer writes no current report', () => {
    const result = runProducer(`c8 --version && node -e "process.exit(0)" && echo node --test`);
    try {
      assert.strictEqual(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /coverage-final\.json not found|did not produce/);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it('retains a failing producer status even when that invocation writes diagnostic coverage', () => {
    const result = runProducer(
      `c8 --version && node -e "require('fs').writeFileSync('coverage/coverage-final.json',JSON.stringify({'src/covered.ts':{s:{'0':1},b:{},f:{}}}));process.exit(7)" && node --test`
    );
    try {
      assert.strictEqual(result.status, 7, result.stdout + result.stderr);
      assert.match(result.stdout, /100\.0% .* required ≥80% ✅/);
      assert.match(result.stderr, /diagnostic only; the invocation remains failed/);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it('does not replace a failed producer status with a generic parse-error status', () => {
    const result = runProducer(
      `c8 --version && node -e "require('fs').writeFileSync('coverage/coverage-final.json','{');process.exit(7)" && node --test`
    );
    try {
      assert.strictEqual(result.status, 7, result.stdout + result.stderr);
      assert.match(result.stderr, /COVERAGE_FILE_PARSE_ERROR/);
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });

  it('isolates nested producer controls while preserving ordinary runner environment', () => {
    const result = runProducer(
      `c8 --version && node -e "const fs=require('fs');fs.writeFileSync('producer-env.json',JSON.stringify({coverage:process.env.NODE_V8_COVERAGE||null,context:process.env.NODE_TEST_CONTEXT??null,extra:process.env.NODE_TEST_REPORTER??null,ordinary:process.env.SAFE_RUNNER_SETTING??null}));fs.writeFileSync('coverage/coverage-final.json',JSON.stringify({'src/covered.ts':{s:{'0':1},b:{},f:{}}}))" && echo node --test`,
      (root) => ({
        NODE_V8_COVERAGE: join(root, 'outer-v8'),
        NODE_TEST_CONTEXT: 'child-v8',
        NODE_TEST_REPORTER: 'tap',
        SAFE_RUNNER_SETTING: 'preserved',
      })
    );
    try {
      assert.strictEqual(result.status, 0, result.stdout + result.stderr);
      assert.deepStrictEqual(
        JSON.parse(readFileSync(join(result.root, 'producer-env.json'), 'utf-8')),
        { coverage: null, context: null, extra: null, ordinary: 'preserved' }
      );
      assert.ok(
        readdirSync(join(result.root, 'outer-v8')).some((file) => file.endsWith('.json')),
        'the outer testcov process must remain instrumented'
      );
    } finally {
      rmSync(result.root, { recursive: true, force: true });
    }
  });
});
