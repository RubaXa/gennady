// @file: Integration tests for config signal in inbox command.
// @consumers: node:test runner
// @tasks: TSK-91

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configPath } from './state-paths.logic.ts';

function spawnInbox(args: string[], stateDir: string, envExtra?: Record<string, string>) {
  return spawnSync(
    'node',
    ['--import', 'tsx', 'cli/cmd/inbox/inbox.cmd.ts', `--state-dir=${stateDir}`, ...args],
    {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, ...envExtra },
    }
  );
}

function writeConfig(stateDir: string, content: string | object) {
  const path = configPath(stateDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

function rmConfig(stateDir: string) {
  try {
    rmSync(configPath(stateDir), { force: true });
    rmSync(dirname(configPath(stateDir)), { recursive: true, force: true });
  } catch {
    /* absent */
  }
}

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-cmd-config-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('inbox config signal', () => {
  it('no config → {"configured":false,"missing":["reposBase","vcsHost"]}, exit 0', () => {
    rmConfig(tmpDir);
    const r = spawnInbox(['--json'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase', 'vcsHost']);
  });

  it('config with reposBase only → missing ["vcsHost"]', () => {
    writeConfig(tmpDir, { version: 1, reposBase: '/repos' });
    const r = spawnInbox(['--json'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['vcsHost']);
  });

  it('--vcs-host flag covers vcsHost → missing ["reposBase"]', () => {
    rmConfig(tmpDir);
    const r = spawnInbox(['--json', '--vcs-host=gitlab.example.com'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase']);
  });

  it('--repos-base flag covers reposBase → missing ["vcsHost"]', () => {
    rmConfig(tmpDir);
    const r = spawnInbox(['--json', '--repos-base=/custom'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['vcsHost']);
  });

  it('full config → passes config check (does not print configured:false)', () => {
    writeConfig(tmpDir, { version: 1, reposBase: '/repos', vcsHost: 'gitlab.example.com' });
    const r = spawnInbox(['--json'], tmpDir);
    assert.notStrictEqual(r.status, 0, 'should fail after config check (no token)');
    assert.ok(!r.stdout.includes('"configured": false'), 'should not print not-configured signal');
    assert.ok(r.stderr.length > 0, 'should print error to stderr');
  });

  it('corrupt config → same as no config, missing both keys', () => {
    writeConfig(tmpDir, 'not json{{');
    const r = spawnInbox(['--json'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase', 'vcsHost']);
  });

  it('no --json, no config → human-readable message, exit 0', () => {
    rmConfig(tmpDir);
    const r = spawnInbox([], tmpDir);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes('agent-inbox не настроен'), 'should print human-readable message');
  });
});
