// @file: Integration tests for testcov.cmd.ts's --check diagnostics — spawned as a subprocess since
//   the command file is a top-level script (no exported `run`), so behavior is observed via stdio/exit.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
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
});
