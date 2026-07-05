// @file: Integration tests for config signal in inbox-context command.
// @consumers: node:test runner
// @tasks: TSK-91

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configPath } from '../inbox/_core/logic/state-paths.logic.ts';

function spawnInboxContext(args: string[], stateDir: string, envExtra?: Record<string, string>) {
  return spawnSync(
    'node',
    [
      '--import',
      'tsx',
      'cli/cmd/inbox-context/inbox-context.cmd.ts',
      `--state-dir=${stateDir}`,
      ...args,
    ],
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

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-ctx-config-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('inbox-context config signal', () => {
  it('--ref group/proj!510 --json, no config → missing both keys', () => {
    const r = spawnInboxContext(['--ref', 'group/proj!510', '--json'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase', 'vcsHost']);
  });

  it('--ref group/proj!510 --json --vcs-host=H → missing ["reposBase"]', () => {
    const r = spawnInboxContext(['--ref', 'group/proj!510', '--json', '--vcs-host=H'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase']);
  });

  it('--ref group/proj!510 --json --vcs-host=H --repos-base=/p → passes config check', () => {
    const r = spawnInboxContext(
      ['--ref', 'group/proj!510', '--json', '--vcs-host=H', '--repos-base=/p'],
      tmpDir
    );
    assert.notStrictEqual(r.status, 0, 'should fail after config check (no token)');
    assert.ok(!r.stdout.includes('"configured": false'), 'should not print not-configured signal');
    assert.ok(r.stderr.length > 0, 'should print error to stderr');
  });

  it('--ref group/proj!510 (no --json), no config → human-readable message, exit 0', () => {
    const r = spawnInboxContext(['--ref', 'group/proj!510'], tmpDir);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes('agent-inbox не настроен'), 'should print human-readable message');
  });

  it('--url <URL> --json, no config → missing ["reposBase"] only (vcsHost covered by URL)', () => {
    const r = spawnInboxContext(
      ['--url', 'https://gitlab.example.com/group/proj/-/merge_requests/510', '--json'],
      tmpDir
    );
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase']);
  });

  it('--url <URL> --json --repos-base=/p, no config → passes config check', () => {
    const r = spawnInboxContext(
      [
        '--url',
        'https://gitlab.example.com/group/proj/-/merge_requests/510',
        '--json',
        '--repos-base=/p',
      ],
      tmpDir
    );
    assert.notStrictEqual(r.status, 0, 'should fail after config check (no token)');
    assert.ok(!r.stdout.includes('"configured": false'), 'should not print not-configured signal');
  });

  it('config with reposBase → reposBase used instead of ~/Developer default', () => {
    writeConfig(tmpDir, { version: 1, reposBase: '/custom/repos' });
    const r = spawnInboxContext(
      ['--ref', 'group/proj!510', '--json', '--vcs-host=H'],
      tmpDir
    );
    assert.notStrictEqual(r.status, 0, 'should fail after config check (no token)');
    assert.ok(!r.stdout.includes('"configured": false'), 'config passed, reposBase from config accepted');
  });
});
