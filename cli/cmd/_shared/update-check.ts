// @file: Non-blocking update check — service orchestrator, cache value object, platform helpers.
// @consumers: cli/gennady.ts
// @tasks: TSK-33

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { platform, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DEFAULT_INTERVAL_MS = 86_400_000;
const WORKER_TIMEOUT_MS = 3000;
const WORKER_FILENAME = 'update-check-worker.ts';
const CACHE_FILENAME = 'update-check-cache.json';

/** @purpose Serialized cache structure persisted by the update-check worker. */
export type UpdateCheckCache = {
  /** @purpose ISO8601 timestamp of the most recent registry check */
  lastCheck: string;
  /** @purpose Latest version string from npm registry response */
  latestVersion: string;
};

/** @purpose Configuration driving the update-check service behaviour. */
export type UpdateCheckOptions = {
  /** @purpose Package identity — name and semver version */
  pkg: { name: string; version: string };
  /** @purpose Minimum interval between checks in ms | @invariant Default 24h (86_400_000 ms) */
  interval?: number;
  /** @purpose Suppress stderr notification when stderr is not a TTY | @invariant Default true — suppresses display only, never the check */
  skipNotificationIfNoTty?: boolean;
  /** @purpose Directory for the update-check cache file | @invariant Must exist before worker spawn */
  cacheDir?: string;
  /** @purpose Inject a custom spawn implementation for testing | @invariant Test seam only — not used in production */
  _spawnFn?: typeof spawn;
};

// #region START_RESOLVE_CACHE_DIR
/**
 * @purpose Resolve platform-specific cache directory path.
 * @param override Explicit directory override.
 * @returns Absolute path to the cache directory.
 */
function resolveCacheDir(override?: string): string {
  if (override) return override;

  if (platform() === 'win32') {
    return resolve(process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData', 'Local'), 'gennady');
  }
  if (platform() === 'darwin') {
    return resolve(homedir(), 'Library', 'Caches', 'gennady');
  }
  return resolve(homedir(), '.cache', 'gennady');
}
// #endregion END_RESOLVE_CACHE_DIR

// #region START_CACHE_READ
/**
 * @purpose Read and parse the update-check cache file.
 * @param cachePath Absolute path to the cache JSON file.
 * @returns Parsed cache or null on any failure (missing, corrupt, invalid shape).
 */
function readCache(cachePath: string): UpdateCheckCache | null {
  try {
    const raw = readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as UpdateCheckCache;

    if (typeof parsed?.lastCheck !== 'string' || typeof parsed?.latestVersion !== 'string')
      return null;

    return parsed;
  } catch {
    return null;
  }
}
// #endregion END_CACHE_READ

/** @purpose Determine if a cache entry is still fresh relative to the check interval. */
function isCacheFresh(cache: UpdateCheckCache, intervalMs: number): boolean {
  return Date.now() - new Date(cache.lastCheck).getTime() < intervalMs;
}

// #region START_SEMVER_GT
/**
 * @purpose Compare two semver strings — returns true if `latest` is strictly greater than `current`.
 * @param current Current installed version.
 * @param latest Version from the npm registry cache.
 * @returns true only when latest > current (prevents downgrade notifications on stale cache).
 * @invariant Uses simple semver parsing (major.minor.patch); falls back to string comparison if parsing fails.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.split('.').map((s) => parseInt(s, 10));
  const cur = parse(current);
  const lat = parse(latest);
  if (cur.some(isNaN) || lat.some(isNaN)) return false;
  for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
    const c = cur[i] ?? 0;
    const l = lat[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}
// #endregion END_SEMVER_GT

// #region START_BEFOREEXIT_NOTIFICATION
/**
 * @purpose Register a deferred beforeExit hook to display update notification on stderr.
 * @invariant Must be called at most once per process lifetime — hook is idempotent (process.on).
 * @invariant Only registered when stderr.isTTY is true OR skipNotificationIfNoTty is explicitly false.
 */
function registerBeforeExitNotification(currentVersion: string, latestVersion: string): void {
  let notified = false;

  process.on('beforeExit', () => {
    if (notified) return;
    notified = true;
    process.stderr.write(`\nUpdate available: ${currentVersion} → ${latestVersion}\n`);
    process.stderr.write(`Run: npm i -g gennady@latest\n\n`);
  });
}
// #endregion END_BEFOREEXIT_NOTIFICATION

/**
 * @purpose Orchestrate a non-blocking update check — read cache, spawn worker if stale, register deferred notification.
 * @implements {UpdateCheck} in specs/cli/update-check/update-check.spec.md#updatecheck
 * @invariant Never throws — all failure paths are silent.
 * @invariant Never blocks process.exit — spawn uses unref().
 * @param pkg Package identity with name and semver version.
 * @param [opts] Optional configuration overrides.
 * @post Returns synchronously without blocking; if stale/missing cache: detached worker spawned via unref(); if fresh cache with newer version: beforeExit hook registered.
 * @sideEffect FS: reads and writes cache directory. Subprocess: may spawn UpdateCheckWorker.
 */
export function checkForUpdates(
  pkg: { name: string; version: string },
  opts?: Partial<UpdateCheckOptions>
): void {
  // #region START_OPTOUT_DETECTION
  if (process.env.GENNADY_NO_UPDATE_CHECK === '1' || process.argv.includes('--no-update-check')) {
    if (process.env.GENNADY_DEBUG === '1') {
      process.stderr.write(
        '[update-check] skipped: opt-out (GENNADY_NO_UPDATE_CHECK or --no-update-check)\n'
      );
    }
    return;
  }

  if (
    process.env.CI === 'true' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.NODE_ENV === 'test'
  ) {
    if (process.env.GENNADY_DEBUG === '1') {
      process.stderr.write('[update-check] skipped: CI/test environment\n');
    }
    return;
  }
  // #endregion END_OPTOUT_DETECTION

  const interval =
    opts?.interval ?? (Number(process.env.GENNADY_UPDATE_CHECK_INTERVAL) || DEFAULT_INTERVAL_MS);
  const cacheDir = resolveCacheDir(opts?.cacheDir);
  const cachePath = resolve(cacheDir, CACHE_FILENAME);

  // #region START_ENSURE_CACHE_DIR
  mkdirSync(cacheDir, { recursive: true });
  // #endregion END_ENSURE_CACHE_DIR

  const cache = readCache(cachePath);

  // #region START_FRESH_CACHE_PATH
  if (cache && isCacheFresh(cache, interval)) {
    if (
      cache.latestVersion &&
      isNewerVersion(pkg.version, cache.latestVersion) &&
      (process.stderr.isTTY || opts?.skipNotificationIfNoTty === false)
    ) {
      registerBeforeExitNotification(pkg.version, cache.latestVersion);
    }
    return;
  }
  // #endregion END_FRESH_CACHE_PATH

  // #region START_SPAWN_WORKER
  const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), WORKER_FILENAME);

  const spawnFn = opts?._spawnFn ?? spawn;

  spawnFn(
    process.execPath,
    [workerPath, pkg.name, pkg.version, cachePath, String(WORKER_TIMEOUT_MS)],
    {
      stdio: 'ignore',
    }
  ).unref();
  // #endregion END_SPAWN_WORKER

  // #region START_STALE_CACHE_NOTIFICATION — older cache may report a newer version while worker rechecks
  if (
    cache?.latestVersion &&
    isNewerVersion(pkg.version, cache.latestVersion) &&
    (process.stderr.isTTY || opts?.skipNotificationIfNoTty === false)
  ) {
    registerBeforeExitNotification(pkg.version, cache.latestVersion);
  }
  // #endregion END_STALE_CACHE_NOTIFICATION
}
