// @file: Unit tests for UpdateCheck service orchestration — temp cache dirs, spawn tracking.
// @consumers: TSK-34
// @tasks: TSK-34

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import childProcess from 'node:child_process';

const _processOn = process.on.bind(process);
const _stderrWrite = process.stderr.write.bind(process.stderr);
let _stdIsTTY = true;
let _beforeExitHandlers: Array<() => void> = [];
let _stderrWrites: string[] = [];
let _spawnCalls: any[][] = [];

const _mockSpawn = (...args: any[]) => {
  _spawnCalls.push(args);
  const child = childProcess.spawn(process.execPath, ['-e', '']);
  return child;
};

process.on = ((event: string, handler: () => void) => {
  if (event === 'beforeExit') _beforeExitHandlers.push(handler);
  return process;
}) as typeof process.on;

process.stderr.write = ((chunk: unknown) => {
  _stderrWrites.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

Object.defineProperty(process.stderr, 'isTTY', { get: () => _stdIsTTY, configurable: true });

const { checkForUpdates } = await import('../update-check.ts');

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_ARGV = [...process.argv];

describe('checkForUpdates', () => {
  let _tmpDir: string;

  beforeEach(() => {
    _spawnCalls = [];
    _tmpDir = mkdtempSync(join(tmpdir(), 'update-check-test-'));
    _beforeExitHandlers = [];
    _stderrWrites = [];
    _stdIsTTY = true;

    process.env = { ...ORIGINAL_ENV };
    delete process.env.GENNADY_NO_UPDATE_CHECK;
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    process.env.NODE_ENV = '';
    delete process.env.GENNADY_DEBUG;

    process.argv = [...ORIGINAL_ARGV];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    process.argv = ORIGINAL_ARGV;
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  it('cache fresh — spawn not called', () => {
    // purpose: fresh cache (<24h) → no spawn, return silently
    // contract: when cache has lastCheck within the interval, spawn must never be called

    // #region START_CACHE_FRESH_SETUP_FIXTURE
    const cachePath = join(_tmpDir, 'update-check-cache.json');
    const freshLastCheck = new Date(Date.now() - 3_600_000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({ lastCheck: freshLastCheck, latestVersion: '0.6.1' }),
      'utf-8'
    );
    // #endregion END_CACHE_FRESH_SETUP_FIXTURE

    // #region START_CACHE_FRESH_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '0.6.1' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_CACHE_FRESH_TRIGGER

    // #region START_CACHE_FRESH_ASSERT_NO_SPAWN
    assert.strictEqual(_spawnCalls.length, 0);
    // #endregion END_CACHE_FRESH_ASSERT_NO_SPAWN
  });

  it('cache stale — spawn with correct args', () => {
    // purpose: absent/stale cache → worker is spawned with execPath, worker script, pkg args, timeout
    // contract: spawn(unref) is the only permissible subprocess invocation — args must be exact

    // #region START_CACHE_STALE_SETUP_FIXTURE
    // no cache file — cache dir exists but cache file absent
    // #endregion END_CACHE_STALE_SETUP_FIXTURE

    // #region START_CACHE_STALE_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '0.6.1' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_CACHE_STALE_TRIGGER

    // #region START_CACHE_STALE_ASSERT_SPAWN_ARGS
    assert.strictEqual(_spawnCalls.length, 1);
    const call = _spawnCalls[0];
    assert.strictEqual(call[0], process.execPath);
    assert.match(String(call[1][0]), /update-check-worker\.ts$/);
    assert.strictEqual(call[1][1], 'test-pkg');
    assert.strictEqual(call[1][2], '0.6.1');
    assert.match(String(call[1][3]), /update-check-cache\.json$/);
    assert.strictEqual(call[1][4], '3000');
    assert.deepStrictEqual(call[2], { stdio: 'ignore' });
    // #endregion END_CACHE_STALE_ASSERT_SPAWN_ARGS
  });

  it('new version + TTY — registers beforeExit', () => {
    // purpose: fresh cache with newer version + TTY → beforeExit hook registered
    // contract: beforeExit hook writes version diff and npm install instruction

    // #region START_NOTIFICATION_SETUP_FIXTURE
    _stdIsTTY = true;
    const cachePath = join(_tmpDir, 'update-check-cache.json');
    const freshLastCheck = new Date(Date.now() - 3_600_000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({ lastCheck: freshLastCheck, latestVersion: '2.0.0' }),
      'utf-8'
    );
    // #endregion END_NOTIFICATION_SETUP_FIXTURE

    // #region START_NOTIFICATION_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '1.0.0' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_NOTIFICATION_TRIGGER

    // #region START_NOTIFICATION_ASSERT_HOOK
    assert.strictEqual(_beforeExitHandlers.length, 1);
    _beforeExitHandlers[0]();
    const output = _stderrWrites.join('');
    assert.match(output, /1\.0\.0 → 2\.0\.0/);
    assert.match(output, /npm i -g gennady@latest/);
    // #endregion END_NOTIFICATION_ASSERT_HOOK
  });

  it('no TTY — notification suppressed', () => {
    // purpose: when stderr is not a TTY, notification is suppressed
    // contract: checkForUpdates must run silently in non-interactive environments

    // #region START_NO_TTY_SETUP_FIXTURE
    _stdIsTTY = false;
    const cachePath = join(_tmpDir, 'update-check-cache.json');
    const freshLastCheck = new Date(Date.now() - 3_600_000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({ lastCheck: freshLastCheck, latestVersion: '2.0.0' }),
      'utf-8'
    );
    // #endregion END_NO_TTY_SETUP_FIXTURE

    // #region START_NO_TTY_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '1.0.0' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_NO_TTY_TRIGGER

    // #region START_NO_TTY_ASSERT_NO_HOOK
    assert.strictEqual(_beforeExitHandlers.length, 0);
    // #endregion END_NO_TTY_ASSERT_NO_HOOK
  });

  it('stale cache with older version — no downgrade notification', () => {
    // purpose: cache has older version than installed (user upgraded since last check) → no notification
    // contract: isNewerVersion prevents downgrade notifications from stale caches

    // #region START_DOWNGRADE_PREVENTION_SETUP_FIXTURE
    _stdIsTTY = true;
    const cachePath = join(_tmpDir, 'update-check-cache.json');
    const freshLastCheck = new Date(Date.now() - 3_600_000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({ lastCheck: freshLastCheck, latestVersion: '0.7.1' }),
      'utf-8'
    );
    // #endregion END_DOWNGRADE_PREVENTION_SETUP_FIXTURE

    // #region START_DOWNGRADE_PREVENTION_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '0.8.1' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_DOWNGRADE_PREVENTION_TRIGGER

    // #region START_DOWNGRADE_PREVENTION_ASSERT_NO_HOOK
    assert.strictEqual(_beforeExitHandlers.length, 0);
    // #endregion END_DOWNGRADE_PREVENTION_ASSERT_NO_HOOK
  });

  it('NO_UPDATE_CHECK — immediate return', () => {
    // purpose: GENNADY_NO_UPDATE_CHECK=1 → return before any FS or spawn call
    // contract: opt-out env var is checked first

    // #region START_OPTOUT_ENV_SETUP
    process.env.GENNADY_NO_UPDATE_CHECK = '1';
    // #endregion END_OPTOUT_ENV_SETUP

    // #region START_OPTOUT_ENV_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '0.6.1' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_OPTOUT_ENV_TRIGGER

    // #region START_OPTOUT_ENV_ASSERT
    assert.strictEqual(_spawnCalls.length, 0);
    // #endregion END_OPTOUT_ENV_ASSERT
  });

  it('--no-update-check flag — immediate return', () => {
    // purpose: CLI flag --no-update-check disables update check for this invocation only
    // contract: process.argv.includes check runs before any FS or spawn

    // #region START_OPTOUT_FLAG_SETUP
    process.argv = [...ORIGINAL_ARGV, '--no-update-check'];
    // #endregion END_OPTOUT_FLAG_SETUP

    // #region START_OPTOUT_FLAG_TRIGGER
    checkForUpdates(
      { name: 'test-pkg', version: '0.6.1' },
      { _spawnFn: _mockSpawn, cacheDir: _tmpDir }
    );
    // #endregion END_OPTOUT_FLAG_TRIGGER

    // #region START_OPTOUT_FLAG_ASSERT
    assert.strictEqual(_spawnCalls.length, 0);
    // #endregion END_OPTOUT_FLAG_ASSERT
  });
});
