// @file: Both-outcomes proof for check-fixture-hygiene.sh (E-16) — a synthetic, hermetic git repo
//   stands in for an external eval fixture (fixture-detmig/rt-regen/fixture-mig-run live OUTSIDE this
//   repo by design, D-62/L-13 variant (a), so the real ones are never touched by this test): a clean
//   worktree with no secret-class files passes; drift and a secret-class file are each independently
//   detected and reported.
// @consumers: migration-eval.sh, roundtrip-eval.sh, operators preparing an external fixture
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = new URL('../check-fixture-hygiene.sh', import.meta.url).pathname;

function run(dir: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [SCRIPT, dir], { encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function git(dir: string, ...args: string[]): void {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

function makeCleanRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-hygiene-'));
  git(dir, 'init', '-q');
  git(
    dir,
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init'
  );
  writeFileSync(join(dir, 'README.md'), '# clean fixture\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'add readme');
  return dir;
}

describe('E-16: check-fixture-hygiene.sh (both-way, hermetic — never touches an external fixture)', () => {
  it('a clean, secret-free worktree passes (exit 0, silent)', () => {
    const dir = makeCleanRepo();
    try {
      const result = run(dir);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uncommitted drift is reported and fails the check', () => {
    const dir = makeCleanRepo();
    try {
      appendFileSync(join(dir, 'README.md'), 'extra line\n');
      const result = run(dir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /uncommitted drift/);
      assert.match(result.stderr, /README\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a secret-class file (.netrc) is detected and fails the check even on a clean tree', () => {
    const dir = makeCleanRepo();
    try {
      writeFileSync(join(dir, '.netrc'), 'machine example.com login x password y\n');
      git(dir, 'add', '-A');
      git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'oops: secret');
      const result = run(dir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /secret class/);
      assert.match(result.stderr, /\.netrc/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a nested secret-class file (sub/credentials.json) is detected below the root', () => {
    const dir = makeCleanRepo();
    try {
      mkdirSync(join(dir, 'sub'), { recursive: true });
      writeFileSync(join(dir, 'sub', 'credentials.json'), '{}\n');
      git(dir, 'add', '-A');
      git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'oops: creds');
      const result = run(dir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /secret class/);
      assert.match(result.stderr, /sub\/credentials\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a source file that merely contains the word "credentials" is NOT a false positive', () => {
    const dir = makeCleanRepo();
    try {
      writeFileSync(join(dir, 'CredentialsStoreImpl.swift'), 'struct CredentialsStoreImpl {}\n');
      git(dir, 'add', '-A');
      git(
        dir,
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '-m',
        'add source file'
      );
      const result = run(dir);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a non-existent directory is a usage error (exit 2), not a false pass', () => {
    const result = run(join(tmpdir(), 'does-not-exist-xyz-fixture-hygiene'));
    assert.equal(result.status, 2);
  });
});
