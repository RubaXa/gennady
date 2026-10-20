// @file: Integration tests for gracefulShutdown — server stops cleanly, no orphan connections.
// @consumers: node:test runner
// @tasks: TSK-115

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { bootstrap } from '../bootstrap.ts';
import { gracefulShutdown } from '../shutdown.ts';

describe('gracefulShutdown — mock mode', () => {
  it('stops server cleanly — new requests fail after shutdown', async () => {
    const result = await bootstrap({ mocks: true, port: 0 });
    await result.server.start();
    const port = result.server.listeningPort() ?? assert.fail('Expected kernel-assigned port');

    // Verify server is alive
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        { hostname: 'localhost', port, path: '/api/board', method: 'GET' },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            assert.strictEqual(res.statusCode, 200);
            resolve();
          });
        }
      );
      req.on('error', reject);
      req.end();
    });

    // Shutdown
    await gracefulShutdown({ server: result.server });

    // Verify server is closed — new requests should fail
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          { hostname: 'localhost', port, path: '/api/board', method: 'GET' },
          () => resolve()
        );
        req.on('error', () => reject(new Error('Expected connection refused')));
        req.end();
        // If we get here without error, set a safety timeout
        setTimeout(() => resolve(), 1000);
      });
      assert.fail('Expected request to fail after server shutdown');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok(
        (err as Error).message.includes('refused') ||
          (err as Error).message.includes('ECONNREFUSED'),
        `Expected connection refused, got: ${(err as Error).message}`
      );
    }
  });

  it('shutdown is idempotent — double shutdown does not throw', async () => {
    const result = await bootstrap({ mocks: true, port: 0 });
    await result.server.start();
    await gracefulShutdown({ server: result.server });
    // Second shutdown should not throw
    await gracefulShutdown({ server: result.server });
  });

  it('shutdown with custom timeout does not hang', async () => {
    const result = await bootstrap({ mocks: true, port: 0 });
    await result.server.start();

    const start = Date.now();
    await gracefulShutdown({ server: result.server, timeout: 500 });
    const elapsed = Date.now() - start;

    // Should complete well within the timeout
    assert.ok(elapsed < 2000, `shutdown completed in ${elapsed}ms (expected < 2000ms)`);
  });
});
