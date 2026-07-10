// @file: Integration tests for bootstrap — DI composition with mocks, server responds to /api/board.
// @consumers: node:test runner
// @tasks: TSK-115

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';

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
  const PORT = 4185;
  let result: BootstrapResult;

  before(async () => {
    result = await bootstrap({ mocks: true, port: PORT });
    await result.server.start();
  });

  after(async () => {
    await result.server.stop();
  });

  it('returns BootstrapResult with mock adapters', () => {
    assert.ok(result.server, 'server should exist');
    assert.ok(result.scheduler, 'scheduler should exist');
    assert.ok(result.opencode, 'opencode should exist');
    assert.strictEqual(result.degraded, false);
    assert.ok(result.opencodeStatus.includes('mock'), 'opencodeStatus should mention mock');
    assert.ok(result.roles.includes('reviewer'), 'roles should include reviewer');
    assert.ok(result.roles.includes('author'), 'roles should include author');
    assert.strictEqual(result.port, PORT);
    assert.ok(result.pollingInterval > 0, 'pollingInterval should be positive');
  });

  it('server responds to /api/board with 200 and valid JSON', async () => {
    const { status, data } = await fetchJson('/api/board', PORT);

    assert.strictEqual(status, 200);
    assert.ok(typeof data === 'object' && data !== null);

    const board = data as Record<string, unknown>;
    assert.ok(Array.isArray(board.roles), 'board.roles should be an array');
    assert.ok(Array.isArray(board.unassigned), 'board.unassigned should be an array');
    assert.ok(
      (board.roles as Array<Record<string, unknown>>).length > 0,
      'at least one role should exist'
    );
  });

  it('server returns 404 for unknown API routes', async () => {
    const { status, data } = await fetchJson('/api/nonexistent', PORT);

    assert.strictEqual(status, 404);
    const body = data as Record<string, unknown>;
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, 'NOT_FOUND');
  });

  it('server returns SPA fallback for non-API routes', async () => {
    const { status } = await fetchJson('/some-page', PORT);

    // SPA fallback returns 200 with HTML (content-type check is done in http-server tests)
    assert.strictEqual(status, 200);
  });
});

describe('bootstrap — default port', () => {
  it('uses port 4174 when no port specified', async () => {
    const r = await bootstrap({ mocks: true });
    assert.strictEqual(r.port, 4174);
  });
});
