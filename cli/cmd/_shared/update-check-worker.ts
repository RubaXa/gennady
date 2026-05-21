// @file: Fire-and-forget npm registry check — isolated worker spawned by UpdateCheck service.
// @consumers: UpdateCheck (spawn via cli/cmd/_shared/update-check.ts)
// @tasks: TSK-33

import { writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [, , pkgName, pkgVersion, cachePath, timeoutMsRaw] = process.argv;

const timeoutMs = Number(timeoutMsRaw);

// #region START_VALIDATE_ARGS
if (!pkgName || !pkgVersion || !cachePath || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
  process.exit(1);
}
// #endregion END_VALIDATE_ARGS

// #region START_MAIN_EXECUTION
try {
  const latestVersion = await fetchLatestVersion(pkgName, timeoutMs);

  writeCache(cachePath, { lastCheck: new Date().toISOString(), latestVersion });
  process.exit(0);
} catch {
  writeBackoffCache(cachePath);
  process.exit(1);
}
// #endregion END_MAIN_EXECUTION

// #region START_FETCH_LATEST
/**
 * @purpose Fetch latest version from npm registry with timeout.
 * @param pkgName Package name to query.
 * @param timeoutMs Maximum time to wait for a response.
 * @returns Latest version string from the registry.
 * @throws {Error} On timeout, network error, non-200 response, or unexpected JSON shape.
 * @sideEffect Network: HTTPS GET to registry.npmjs.org/<pkg>/latest
 */
async function fetchLatestVersion(pkgName: string, timeoutMs: number): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`[UpdateCheckWorker] HTTP ${response.status}`);

  const body = (await response.json()) as unknown;

  if (
    body === null ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).version !== 'string'
  ) {
    throw new Error('[UpdateCheckWorker] Unexpected response shape');
  }

  return (body as { version: string }).version;
}
// #endregion END_FETCH_LATEST

// #region START_WRITE_CACHE
/**
 * @purpose Atomically write cache JSON via temp file + renameSync.
 * @param targetPath Absolute path to the cache file.
 * @param cache Cache payload to persist.
 * @sideEffect FS: temp file write + renameSync.
 */
function writeCache(targetPath: string, cache: { lastCheck: string; latestVersion: string }): void {
  const tmpPath = `${targetPath}.${randomUUID()}.tmp`;

  writeFileSync(tmpPath, JSON.stringify(cache), 'utf-8');
  renameSync(tmpPath, targetPath);
}
// #endregion END_WRITE_CACHE

// #region START_BACKOFF_CACHE
/**
 * @purpose On failure: preserve old latestVersion, bump lastCheck by +1h to prevent retry flood.
 * @param targetPath Absolute path to the cache file.
 * @sideEffect FS: reads existing cache, writes backoff cache.
 */
function writeBackoffCache(targetPath: string): void {
  let oldLatestVersion = '';

  if (existsSync(targetPath)) {
    try {
      const raw = readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(raw) as { latestVersion?: string };

      oldLatestVersion = typeof parsed?.latestVersion === 'string' ? parsed.latestVersion : '';
    } catch {
      oldLatestVersion = '';
    }
  }

  const backoffTime = new Date(Date.now() + 3_600_000).toISOString();

  writeCache(targetPath, { lastCheck: backoffTime, latestVersion: oldLatestVersion });
}
// #endregion END_BACKOFF_CACHE
