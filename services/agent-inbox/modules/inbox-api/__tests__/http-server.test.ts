// @file: Integration tests for HttpServer — SPA fallback, graceful shutdown, CORS preflight.
// @consumers: node:test runner
// @tasks: TSK-106

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';

/** @purpose Helper to make an HTTP request and collect response as text. */
function fetchText(
  path: string,
  port: number,
  opts?: { method?: string; headers?: Record<string, string> }
): Promise<{ status: number; data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method: opts?.method ?? 'GET',
        headers: opts?.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            data: Buffer.concat(chunks).toString('utf-8'),
            headers: res.headers as Record<string, string>,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('HttpServer — SPA fallback', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  const PORT = 4180;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: PORT, boardProvider: provider });
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  it('returns 200 with HTML body for unknown non-API routes (SPA fallback)', async () => {
    const { status, data, headers } = await fetchText('/some-page', PORT);

    assert.strictEqual(status, 200);
    assert.ok(headers['content-type']?.includes('text/html'), 'Content-Type should be text/html');
    assert.ok(data.includes('</html>'), 'Response should contain HTML');
  });

  it('returns 404 for unknown API routes', async () => {
    const { status, data } = await fetchText('/api/unknown', PORT);

    assert.strictEqual(status, 404);

    const body = JSON.parse(data) as Record<string, unknown>;
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, 'NOT_FOUND');
  });

  it('handles CORS preflight (OPTIONS)', async () => {
    const { status, headers } = await fetchText('/api/board', PORT, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });

    assert.strictEqual(status, 204);
    assert.ok(headers['access-control-allow-origin']?.includes('localhost:5173'));
  });
});

describe('HttpServer — graceful shutdown', () => {
  const PORT = 4181;

  it('start and stop succeed without errors', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: PORT, boardProvider: provider });

    await server.start();

    // Verify the server responds
    const { status } = await fetchText('/api/board', PORT);
    assert.strictEqual(status, 200);

    await server.stop();

    // After stop, new requests should fail
    try {
      await fetchText('/api/board', PORT);
      assert.fail('Expected request to fail after server stop');
    } catch {
      // Expected: connection refused
    }
  });

  it('active requests are handled during shutdown', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: PORT + 1, boardProvider: provider });

    await server.start();

    // Start a request — it will have an active connection
    const requestPromise = fetchText('/api/board', PORT + 1);

    // Wait a small tick for the request to establish connection
    await new Promise((r) => setTimeout(r, 50));

    // Now stop — existing connection should still complete
    await server.stop();

    const { status } = await requestPromise;
    assert.strictEqual(status, 200);
  });

  it('double stop is safe', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: PORT + 2, boardProvider: provider });

    await server.start();
    await server.stop();
    // Second stop should not throw
    await server.stop();
  });

  it('double start rejects', async () => {
    const provider = new BoardProviderMock();
    const server = new HttpServer({ port: PORT + 3, boardProvider: provider });

    await server.start();
    try {
      await server.start();
      assert.fail('Expected double start to reject');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('already running'));
    }
    await server.stop();
  });
});
