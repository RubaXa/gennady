// @file: Integration tests for ArtifactRouter — list artifacts, read content, path-traversal guard.
// @consumers: node:test runner
// @tasks: TSK-106, TSK-162

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';

/** @purpose Helper to make an HTTP request and collect the response. */
function fetchJson(
  method: string,
  path: string,
  port: number
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path,
        method,
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
    req.end();
  });
}

describe('ArtifactRouter — GET /api/mr/:id/artifacts + /api/mr/:id/artifact', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/500',
      iid: 500,
      title: 'feat: artifact test',
    });

    provider.seed(
      {
        roles: [{ name: 'reviewer', active: true }],
        unassigned: [mr],
      },
      undefined,
      {
        [mr.webUrl]: [
          { name: 'REPORT.md', path: 'REPORT.md', kind: 'md', content: '# Report\n\nAll good.' },
          { name: 'PLAN.md', path: 'PLAN.md', kind: 'md', content: '# Plan' },
          { name: 'coverage.json', path: 'tracks/coverage.json', kind: 'json', content: '{}' },
        ],
      }
    );

    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    const listeningPort = server.listeningPort();
    if (!listeningPort) throw new Error('ArtifactRouter test server did not bind a TCP port');
    port = listeningPort;
  });

  after(async () => {
    await server.stop();
  });

  const mrId = 'https://gitlab.example.com/group/project/-/merge_requests/500';

  it('lists artifacts for an MR', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifacts`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; artifacts: Array<{ name: string; path: string }> };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.artifacts.length, 3);
    assert.ok(body.artifacts.some((a) => a.path === 'REPORT.md'));
    assert.ok(body.artifacts.some((a) => a.path === 'tracks/coverage.json'));
  });

  it('returns an empty list for unknown MR', async () => {
    const path = `/api/mr/${encodeURIComponent('https://unknown.example.com/mr/999')}/artifacts`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; artifacts: unknown[] };
    assert.strictEqual(body.ok, true);
    assert.deepStrictEqual(body.artifacts, []);
  });

  it('returns artifact content for a valid path', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent('REPORT.md')}`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; content: string; kind: string };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.kind, 'md');
    assert.ok(body.content.includes('All good.'));
  });

  it('returns artifact content for a nested path', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent('tracks/coverage.json')}`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; content: string; kind: string };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.kind, 'json');
  });

  it('returns 404 for an unknown artifact path', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent('MISSING.md')}`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 404);
    assert.deepStrictEqual(data, {
      error: {
        code: 'not_found',
        message: 'Artifact not found: MISSING.md',
        anchor: 'path',
      },
    });
  });

  it('returns 400 when path is missing', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, {
      error: {
        code: 'invalid_input',
        message: 'Artifact path is missing or unsafe',
        anchor: 'path',
      },
    });
  });

  it('returns 400 for a path-traversal attempt (../../etc/passwd)', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent('../../etc/passwd')}`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, {
      error: {
        code: 'invalid_input',
        message: 'Artifact path is missing or unsafe',
        anchor: 'path',
      },
    });
  });

  it('returns 400 for an absolute path attempt', async () => {
    const path = `/api/mr/${encodeURIComponent(mrId)}/artifact?path=${encodeURIComponent('/etc/passwd')}`;
    const { status, data } = await fetchJson('GET', path, port);

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, {
      error: {
        code: 'invalid_input',
        message: 'Artifact path is missing or unsafe',
        anchor: 'path',
      },
    });
  });
});
