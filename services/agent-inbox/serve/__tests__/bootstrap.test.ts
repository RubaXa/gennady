// @file: Integration tests for bootstrap — DI composition with mocks, server responds to /api/board.
// @consumers: node:test runner
// @tasks: TSK-115, TSK-160, TSK-167, TSK-170

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';
import { gracefulShutdown } from '../shutdown.ts';
import { StateStore } from '../../modules/inbox-core/state-store.ts';

const execFileAsync = promisify(execFile);

/**
 * @purpose Poll `ps -p <pid>` until the process is gone or `timeoutMs` elapses (D1).
 * @param pid Process to watch.
 * @param timeoutMs Give up and return `false` after this long.
 * @returns True once the pid is confirmed gone.
 */
async function waitForProcessExit(pid: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await execFileAsync('ps', ['-p', String(pid)]);
    } catch {
      return true; // `ps` exits non-zero when the pid no longer exists
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * @purpose Open a raw connection to an SSE route and resolve with just the response status/headers
 * — never waits for the (long-lived) body, since the test only needs to prove the route is LIVE
 * (200, `text/event-stream`) rather than 404 (chat bridge wired vs. absent, TSK-133).
 * @param path URL path to request.
 * @param port Server port.
 * @returns Response status code and content-type header, then destroys the connection.
 */
async function probeSseRoute(
  path: string,
  port: number
): Promise<{ status: number; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: 'localhost', port, path, method: 'GET' }, (res) => {
      const result = {
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'],
      };
      req.destroy();
      resolve(result);
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      // `req.destroy()` above races the server socket teardown and can surface as ECONNRESET on
      // some platforms — that's a side effect of the probe intentionally not draining the body,
      // not a real connection failure, since `resolve` already ran from the response handler.
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });
    req.end();
  });
}

/**
 * @purpose Helper: make an HTTP GET request and collect the response.
 * @param path URL path to request.
 * @param port Server port.
 * @returns Parsed JSON body on 2xx, or error status.
 */
async function fetchJson(path: string, port: number): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve({
              status: res.statusCode ?? 0,
              data: body ? JSON.parse(body) : null,
            });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: null });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('bootstrap — mock mode', () => {
  let result: BootstrapResult;
  let port: number;

  before(async () => {
    result = await bootstrap({ mocks: true, port: 0 });
    await result.server.start();
    port = result.server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    // Full teardown, not just server.stop(): the scheduler and session lifecycle hold timers
    // that otherwise keep the test process alive past the last assertion (suite hang).
    await gracefulShutdown({
      server: result.server,
      scheduler: result.scheduler,
      opencode: result.opencode,
      opencodeProcess: result.opencodeProcess,
      opencodePidFile: result.opencodePidFile,
    });
    clearInterval(result.lifecycleReaper);
  });

  it('returns BootstrapResult with mock adapters', () => {
    assert.ok(result.server, 'server should exist');
    assert.ok(result.scheduler, 'scheduler should exist');
    assert.ok(result.opencode, 'opencode should exist');
    assert.strictEqual(result.degraded, false);
    assert.ok(result.opencodeStatus.includes('mock'), 'opencodeStatus should mention mock');
    assert.ok(result.roles.includes('reviewer'), 'roles should include reviewer');
    assert.ok(result.roles.includes('author'), 'roles should include author');
    assert.strictEqual(result.port, 0);
    assert.ok(result.pollingInterval > 0, 'pollingInterval should be positive');
  });

  it('binds the boot-owned lifecycle to the live adapter and clears TTL-closed routing', async () => {
    const sid = await result.sessionPool.create({
      title: 'lifecycle-proof',
      directory: process.cwd(),
      registration: {
        taskId: 'TSK-160-proof',
        mr: 'https://gitlab.test/group/project/-/merge_requests/160',
      },
    });
    assert.strictEqual(result.sessionRegistry.lookup(sid)?.state, 'work');

    await result.sessionLifecycle.park(sid);
    assert.strictEqual(await result.sessionLifecycle.resume(sid), true);
    await result.sessionLifecycle.park(sid);
    await result.sessionLifecycle.close(sid);

    assert.strictEqual(result.sessionRegistry.lookup(sid), undefined);
    assert.strictEqual(await result.opencode.status(sid), 'terminated');
    assert.strictEqual(
      result.sessionPool.isActive(sid),
      false,
      'closed session must free pool slot'
    );
  });

  it('server responds to /api/board with 200 and valid JSON', async () => {
    const { status, data } = await fetchJson('/api/board', port);

    assert.strictEqual(status, 200);
    assert.ok(typeof data === 'object' && data !== null);

    // BoardProjection owns /api/board since TSK-158: the shape is attention-grouped
    // ({ groups, cards, syncState }), not the legacy role-based provider payload.
    const board = data as Record<string, unknown>;
    assert.ok(Array.isArray(board.cards), 'board.cards should be an array');
    assert.ok(
      board.syncState === 'ok' || board.syncState === 'degraded' || board.syncState === 'syncing',
      'board.syncState should be ok|degraded|syncing'
    );
  });

  it('server returns 404 for unknown API routes', async () => {
    const { status, data } = await fetchJson('/api/nonexistent', port);

    assert.strictEqual(status, 404);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, { code: 'not_found', message: 'Unknown API route' });
  });

  it('server returns SPA fallback for non-API routes', async () => {
    const { status } = await fetchJson('/some-page', port);

    // SPA fallback returns 200 with HTML (content-type check is done in http-server tests)
    assert.strictEqual(status, 200);
  });

  it('/api/mr/:id/chat/stream is LIVE (real SSE 200), not 404 — chat bridge actually wired (TSK-133)', async () => {
    const { status, contentType } = await probeSseRoute(
      '/api/mr/group%2Fproj%21930/chat/stream',
      port
    );

    assert.strictEqual(status, 200, 'chat/stream must be a live SSE route, not a 404 fallback');
    assert.match(
      contentType ?? '',
      /text\/event-stream/,
      'chat/stream must respond as a real SSE connection'
    );
  });
});

describe('bootstrap — default port', () => {
  let r: Awaited<ReturnType<typeof bootstrap>>;
  before(async () => {
    r = await bootstrap({ mocks: true });
  });
  after(async () => {
    await r.server.stop();
    clearInterval(r.lifecycleReaper);
    await r.scheduler.stop();
  });
  it('uses port 4174 when no port specified', () => {
    assert.strictEqual(r.port, 4174);
  });
});

describe('bootstrap — real mode (spawns a real opencode serve process)', () => {
  let result: BootstrapResult;
  let port: number;

  before(async () => {
    // real mode: no --mocks, real VcsInboxReal/OpenCodeReal wiring, real `opencode serve` child
    // process spawned + health-polled by bootstrap itself (spawnOpencode) — genuinely exercises
    // the non-mock HttpServer construction call site (bootstrap.ts's second `new HttpServer(...)`).
    result = await bootstrap({ mocks: false, port: 0 });
    await result.server.start();
    port = result.server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    // Full teardown: gracefulShutdown stops the scheduler timers and reaps the real opencode
    // child — a bare server.stop() left the suite process hanging on open handles.
    await gracefulShutdown({
      server: result.server,
      scheduler: result.scheduler,
      opencode: result.opencode,
      opencodeProcess: result.opencodeProcess,
      opencodePidFile: result.opencodePidFile,
    });
  });

  it('bootstraps a real (non-mock) HttpServer with a live chat bridge', () => {
    assert.strictEqual(
      result.degraded,
      false,
      `expected connected opencode, got: ${result.opencodeStatus}`
    );
    assert.ok(
      result.opencodeStatus.includes('connected'),
      `expected a connected real opencode, got: ${result.opencodeStatus}`
    );
  });

  it('/api/mr/:id/chat/stream is LIVE (real SSE 200) in real mode too — not gated behind --mocks', async () => {
    const { status, contentType } = await probeSseRoute(
      '/api/mr/group%2Fproj%21931/chat/stream',
      port
    );

    assert.strictEqual(status, 200, 'chat/stream must be live in real mode, not a 404 fallback');
    assert.match(
      contentType ?? '',
      /text\/event-stream/,
      'chat/stream must be a real SSE connection'
    );
  });
});

describe('bootstrap — orphan opencode restart (D1)', () => {
  const port = 0;
  let stateDir: string;
  let orphan: ChildProcess;
  let result: BootstrapResult | undefined;

  before(async () => {
    // A REAL opencode process (not a mock) standing in for a previous `gennady inbox serve`
    // instance's child that outlived its own parent's cleanup — isOpencodePid's `ps -o comm=`
    // check requires the real binary, a stub process name would not pass it.
    orphan = spawn('opencode', ['serve', '--port', '0'], { stdio: 'ignore', detached: false });
    await new Promise<void>((resolve, reject) => {
      orphan.once('spawn', () => resolve());
      orphan.once('error', reject);
    });

    stateDir = mkdtempSync(join(tmpdir(), 'gennady-orphan-restart-'));
    mkdirSync(join(stateDir, 'agent-inbox'), { recursive: true });

    // Load the real GitLab host from the default config so VCS sync during real-mode bootstrap
    // does not fail with 'fetch failed'.  `mocks: false` triggers a full twoTierSync and a
    // mocked hostname would never resolve.
    const realStore = new StateStore();
    const realConfig = await realStore.loadConfig();
    if (!realConfig.configured) {
      // Cannot test orphan restart without a real GitLab config — tear down and skip.
      orphan.kill('SIGKILL');
      throw new Error('SKIP_ORPHAN_RESTART: default ~/.gennady config is not fully configured');
    }
    await new StateStore(stateDir).saveConfig({
      reposBase: realConfig.reposBase,
      vcsHost: realConfig.vcsHost,
    });

    // Pid file scoped by the kernel-assigned-port request (`0`) per D-138 — nothing is actually
    // listening yet, so bootstrap's own httpAlive check correctly reads "not alive",
    // and the recorded pid (a real, live opencode process) reads as a genuine orphan.
    writeFileSync(
      join(stateDir, 'agent-inbox', `opencode-${port}.pid`),
      JSON.stringify({ pid: orphan.pid, port }),
      'utf-8'
    );
  });

  after(async () => {
    await result?.server.stop();
    result?.opencodeProcess?.kill('SIGTERM');
    orphan.kill('SIGKILL'); // best-effort — the test itself proves bootstrap already terminated it
  });

  it('detects the stale pid, terminates the real orphan, and boots a fresh connected opencode', async () => {
    result = await bootstrap({ mocks: false, port, stateDir });
    await result.server.start();

    assert.strictEqual(
      result.degraded,
      false,
      `expected a fresh connected opencode after orphan cleanup, got: ${result.opencodeStatus}`
    );
    assert.ok(
      result.opencodeStatus.includes('connected'),
      `expected connected, got: ${result.opencodeStatus}`
    );

    const orphanGone = await waitForProcessExit(orphan.pid!);
    assert.ok(
      orphanGone,
      'the orphaned opencode process must actually be terminated, not just logged as such'
    );
  });
});

// Multi-server test suites can accumulate native libuv handles (undici TLSSocket,
// connection sockets from undici) that Node.js may not release before the test
// runner's event-loop idle check. A grace period allows normal cleanup including
// the real opencode spawn/health-poll cycle (~10-15 s); process.exit(0) covers
// the case where native handles stall the loop past that.
setTimeout(() => process.exit(0), 120_000).unref();
