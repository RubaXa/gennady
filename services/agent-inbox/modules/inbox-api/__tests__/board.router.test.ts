// @file: Integration tests for BoardRouter — GET /api/board endpoint.
// @consumers: node:test runner
// @tasks: TSK-106

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';

/** @purpose Helper to make an HTTP request and collect the response. */
function fetchJson(
  method: string,
  path: string,
  port: number,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('BoardRouter — GET /api/board', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  const PORT = 4175;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: PORT, boardProvider: provider });
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  it('returns 200 with JSON body containing roles and unassigned', async () => {
    const mr1 = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
      iid: 1,
      title: 'feat: test MR',
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr1],
    });

    const { status, data } = await fetchJson('GET', '/api/board', PORT);
    assert.strictEqual(status, 200);

    const body = data as Record<string, unknown>;
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.roles));
    assert.ok(Array.isArray(body.unassigned));
    assert.strictEqual((body.roles as Array<unknown>).length, 1);
  });

  it('returns CORS headers', async () => {
    const mr1 = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/2',
      iid: 2,
    });
    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr1],
    });

    const { status } = await fetchJson('GET', '/api/board', PORT);
    assert.strictEqual(status, 200);

    // Verify CORS header via raw request
    const corsResult = await new Promise<{ status: number; headers: Record<string, string> }>(
      (resolve, reject) => {
        const req = request(
          {
            hostname: 'localhost',
            port: PORT,
            path: '/api/board',
            method: 'GET',
            headers: { origin: 'http://localhost:5173' },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers as Record<string, string>,
              });
            });
          }
        );
        req.on('error', reject);
        req.end();
      }
    );

    assert.strictEqual(corsResult.status, 200);
    assert.strictEqual(corsResult.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('returns empty board when no data seeded', async () => {
    const emptyProvider = new BoardProviderMock();
    // Port 4195 (not PORT + 1 = 4176) — 4176 collides with mr.router.test.ts's own PORT constant;
    // node's test runner executes files concurrently, so sharing a port with another suite's
    // server causes an intermittent EADDRINUSE (pre-existing flake, unrelated to this file).
    const emptyServerPort = 4195;
    const emptyServer = new HttpServer({ port: emptyServerPort, boardProvider: emptyProvider });
    await emptyServer.start();

    try {
      const { status, data } = await fetchJson('GET', '/api/board', emptyServerPort);
      assert.strictEqual(status, 200);

      const body = data as Record<string, unknown>;
      assert.strictEqual(body.ok, true);
      assert.deepStrictEqual(body.roles, []);
      assert.deepStrictEqual(body.unassigned, []);
    } finally {
      await emptyServer.stop();
    }
  });
});
