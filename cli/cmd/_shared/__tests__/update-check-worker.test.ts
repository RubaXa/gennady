// @file: Integration tests for UpdateCheckWorker — local HTTP server, real fs cache, fetch interception.
// @consumers: TSK-34
// @tasks: TSK-34

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let _server: Server;
let _port: number;
let _serverHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

const _exitOriginal = process.exit.bind(process);
let _exitCode: number | null = null;

const _fetchOriginal = globalThis.fetch.bind(globalThis);

before(async () => {
  _server = createServer((req, res) => {
    if (_serverHandler) return _serverHandler(req, res);
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((resolve) => _server.listen(0, resolve));
  _port = (_server.address() as { port: number }).port;

  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('registry.npmjs.org')) {
      const localUrl = urlStr.replace(
        /https:\/\/registry\.npmjs\.org/,
        `http://localhost:${_port}`
      );
      return _fetchOriginal(localUrl, init);
    }
    return _fetchOriginal(url, init);
  }) as typeof fetch;

  process.exit = ((code?: number) => {
    _exitCode = code ?? 0;
  }) as typeof process.exit;
});

after(() => {
  _server?.close();
  globalThis.fetch = _fetchOriginal;
  process.exit = _exitOriginal;
});

function resetExitMock(): void {
  _exitCode = null;
}

function tmpCacheDir(): string {
  return mkdtempSync(join(tmpdir(), 'update-check-test-'));
}

describe('update-check-worker', () => {
  it('registry responds 200 with version', async () => {
    // purpose: when registry returns 200 with a valid version, worker writes atomic cache and exits 0
    // contract: cache file exists with lastCheck + latestVersion; temp file is removed; exit code 0
    resetExitMock();
    _serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '1.3.0' }));
    };

    // #region START_SUCCESS_SETUP_ENV
    const tmpDir = tmpCacheDir();
    const cachePath = join(tmpDir, 'cache.json');
    process.argv = ['node', 'worker', 'test-pkg', '1.0.0', cachePath, '5000'];
    // #endregion END_SUCCESS_SETUP_ENV

    // #region START_SUCCESS_TRIGGER_IMPORT
    await import(`../update-check-worker.ts?t=${randomUUID()}`);
    // #endregion END_SUCCESS_TRIGGER_IMPORT

    // #region START_SUCCESS_ASSERT_RESULT
    assert.strictEqual(_exitCode, 0);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    assert.ok(typeof cache.lastCheck === 'string');
    assert.ok(new Date(cache.lastCheck).getTime() > Date.now() - 60_000);
    assert.strictEqual(cache.latestVersion, '1.3.0');
    const { readdirSync } = await import('node:fs');
    const dirFiles = readdirSync(tmpDir);
    assert.strictEqual(dirFiles.length, 1);
    assert.strictEqual(dirFiles[0], 'cache.json');
    rmSync(tmpDir, { recursive: true });
    // #endregion END_SUCCESS_ASSERT_RESULT
  });

  it('registry timeout — exit 1', async () => {
    // purpose: when registry does not respond within timeoutMs, worker exits 1 and writes backoff cache
    // contract: exit code 1; lastCheck shifted to +1h; old latestVersion preserved if existed
    resetExitMock();
    _serverHandler = (_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '9.9.9' }));
      }, 300);
    };

    // #region START_TIMEOUT_SETUP_ENV
    const tmpDir = tmpCacheDir();
    const cachePath = join(tmpDir, 'cache.json');
    const oldCheckTime = new Date(Date.now() - 7_200_000).toISOString();
    writeFileSync(
      cachePath,
      JSON.stringify({ lastCheck: oldCheckTime, latestVersion: '1.2.0' }),
      'utf-8'
    );
    process.argv = ['node', 'worker', 'test-pkg', '1.0.0', cachePath, '100'];
    // #endregion END_TIMEOUT_SETUP_ENV

    // #region START_TIMEOUT_TRIGGER_IMPORT
    await import(`../update-check-worker.ts?t=${randomUUID()}`);
    // #endregion END_TIMEOUT_TRIGGER_IMPORT

    // #region START_TIMEOUT_ASSERT_RESULT
    assert.strictEqual(_exitCode, 1);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const backoffTime = new Date(cache.lastCheck).getTime();
    const now = Date.now();
    assert.ok(backoffTime > Date.now() + 3_500_000);
    assert.ok(backoffTime < now + 3_700_000);
    assert.strictEqual(cache.latestVersion, '1.2.0');
    rmSync(tmpDir, { recursive: true });
    // #endregion END_TIMEOUT_ASSERT_RESULT
  });

  it('registry returns 404 — exit 1', async () => {
    // purpose: HTTP 404 from registry → worker exits 1, writes backoff cache
    // contract: exit 1; backoff cache with lastCheck shifted to +1h
    resetExitMock();
    _serverHandler = (_req, res) => {
      res.writeHead(404);
      res.end('Not Found');
    };

    // #region START_404_SETUP_ENV
    const tmpDir = tmpCacheDir();
    const cachePath = join(tmpDir, 'cache.json');
    process.argv = ['node', 'worker', 'test-pkg', '1.0.0', cachePath, '5000'];
    // #endregion END_404_SETUP_ENV

    // #region START_404_TRIGGER_IMPORT
    await import(`../update-check-worker.ts?t=${randomUUID()}`);
    // #endregion END_404_TRIGGER_IMPORT

    // #region START_404_ASSERT_RESULT
    assert.strictEqual(_exitCode, 1);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const backoffTime = new Date(cache.lastCheck).getTime();
    assert.ok(backoffTime > Date.now() + 3_500_000);
    assert.strictEqual(cache.latestVersion, '');
    rmSync(tmpDir, { recursive: true });
    // #endregion END_404_ASSERT_RESULT
  });

  it('registry returns bad JSON — exit 1', async () => {
    // purpose: registry returns 200 but JSON lacks 'version' field → worker rejects and exits 1
    // contract: exit 1; backoff cache written
    resetExitMock();
    _serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ foo: 'bar' }));
    };

    // #region START_BADJSON_SETUP_ENV
    const tmpDir = tmpCacheDir();
    const cachePath = join(tmpDir, 'cache.json');
    process.argv = ['node', 'worker', 'test-pkg', '1.0.0', cachePath, '5000'];
    // #endregion END_BADJSON_SETUP_ENV

    // #region START_BADJSON_TRIGGER_IMPORT
    await import(`../update-check-worker.ts?t=${randomUUID()}`);
    // #endregion END_BADJSON_TRIGGER_IMPORT

    // #region START_BADJSON_ASSERT_RESULT
    assert.strictEqual(_exitCode, 1);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    assert.ok(typeof cache.lastCheck === 'string');
    assert.strictEqual(cache.latestVersion, '');
    rmSync(tmpDir, { recursive: true });
    // #endregion END_BADJSON_ASSERT_RESULT
  });
});
