// @file: Tests for inbox-review-plan command — deterministic track classification.
// @consumers: node:test runner
// @tasks: TSK-102

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function runPlan(args: string[]) {
  return spawnSync(
    'node',
    ['--import', 'tsx', 'cli/cmd/inbox-review-plan/inbox-review-plan.cmd.ts', ...args],
    {
      encoding: 'utf8',
      cwd: process.cwd(),
    }
  );
}

describe('inbox-review-plan', () => {
  it('small diff (HEAD~1) → valid plan', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~1']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    assert.ok(plan.mode === 'inline' || plan.mode === 'fan_out');
    assert.ok(Array.isArray(plan.tracks));
    assert.ok(typeof plan.summary.totalFiles === 'number');
    assert.ok(typeof plan.summary.totalLines === 'number');
  });

  it('--help prints usage', () => {
    const r = runPlan(['--help']);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes('inbox-review-plan'));
    assert.ok(r.stdout.includes('--path'));
    assert.ok(r.stdout.includes('--base'));
  });

  it('missing --path → INVALID_ARGS error', () => {
    const r = runPlan(['--base', 'HEAD~1']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'INVALID_ARGS');
  });

  it('missing --base → INVALID_ARGS error', () => {
    const r = runPlan(['--path', '.']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'INVALID_ARGS');
  });

  it('nonexistent worktree → WORKTREE error', () => {
    const r = runPlan(['--path', '/nonexistent/path/12345', '--base', 'HEAD~1']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim());
    assert.strictEqual(err.error, 'WORKTREE');
  });

  it('tracks have required fields', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~5']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    for (const track of plan.tracks) {
      assert.ok(typeof track.name === 'string');
      assert.ok(Array.isArray(track.files));
      assert.ok(typeof track.lineCount === 'number');
      assert.ok(typeof track.focus === 'string');
      assert.ok(typeof track.directive === 'string');
    }
  });

  it('summary fields present', () => {
    const r = runPlan(['--path', '.', '--base', 'HEAD~5']);
    assert.strictEqual(r.status, 0);
    const plan = JSON.parse(r.stdout.trim());
    assert.ok(typeof plan.summary.totalFiles === 'number');
    assert.ok(typeof plan.summary.totalLines === 'number');
    assert.ok(typeof plan.summary.meaningfulTracks === 'number');
  });

  it('security file path detected in classification', () => {
    // Create a temp git repo with a security-named file and verify classification
    const tmpDir = join(process.cwd(), '.tmp-review-plan-test-' + Date.now());
    try {
      mkdirSync(tmpDir, { recursive: true });
      execFileSync('git', ['-C', tmpDir, 'init'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'test@test.com'], {
        stdio: 'ignore',
      });
      execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });

      writeFileSync(join(tmpDir, 'auth.ts'), 'export const token = "x";\n');
      writeFileSync(join(tmpDir, 'normal.ts'), 'export const x = 1;\n');
      execFileSync('git', ['-C', tmpDir, 'add', '.'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'base'], { stdio: 'ignore' });

      writeFileSync(join(tmpDir, 'auth.ts'), 'export const token = "y";\n');
      writeFileSync(join(tmpDir, 'normal.ts'), 'export const x = 2;\n');
      execFileSync('git', ['-C', tmpDir, 'add', '.'], { stdio: 'ignore' });
      execFileSync('git', ['-C', tmpDir, 'commit', '-m', 'change'], { stdio: 'ignore' });

      const r = runPlan(['--path', tmpDir, '--base', 'HEAD~1']);
      assert.strictEqual(r.status, 0);
      const plan = JSON.parse(r.stdout.trim());

      const securityTrack = plan.tracks.find((t: { name: string }) => t.name === 'security');
      const logicTrack = plan.tracks.find((t: { name: string }) => t.name === 'logic');

      assert.ok(securityTrack, 'security track should exist for auth.ts');
      assert.ok(securityTrack.files.includes('auth.ts'), 'auth.ts should be in security track');
      if (logicTrack) {
        assert.ok(!logicTrack.files.includes('auth.ts'), 'auth.ts should NOT be in logic track');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
