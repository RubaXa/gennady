// @file: Integration tests for MrRouter — POST assign, POST action, GET report, 404 cases.
// @consumers: node:test runner
// @tasks: TSK-106

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { MrDetail } from '../types.ts';

/** @purpose Helper to make an HTTP request and collect the response. */
function fetchJson(
  method: string,
  path: string,
  port: number,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
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

describe('MrRouter — POST /api/mr/:id/assign', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    await server.stop();
  });

  it('assigns an MR to a role and returns { ok: true }', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/100',
      iid: 100,
      title: 'feat: assign test',
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr],
    });

    const assignPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/assign`;
    const { status, data } = await fetchJson('POST', assignPath, port, {
      role: 'reviewer',
    });

    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data, { ok: true });

    // Verify MR moved to reviewer role
    const board = provider.getBoard();
    assert.strictEqual(board.unassigned.length, 0);
    const reviewerRole = board.roles.find((r) => r.name === 'reviewer');
    assert.ok(reviewerRole);
    assert.strictEqual(reviewerRole.lanes.inbox.length, 1);
    assert.strictEqual(reviewerRole.lanes.inbox[0].webUrl, mr.webUrl);
  });

  it('returns 404 for unknown MR', async () => {
    const { status, data } = await fetchJson(
      'POST',
      `/api/mr/${encodeURIComponent('https://unknown.example.com/mr/999')}/assign`,
      port,
      { role: 'reviewer' }
    );

    assert.strictEqual(status, 404);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, {
      code: 'not_found',
      message: 'MR not found: https://unknown.example.com/mr/999',
      anchor: 'mr',
    });
  });
});

describe('MrRouter — POST /api/mr/:id/action', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    await server.stop();
  });

  it('executes an action and returns { ok: true }', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/200',
      iid: 200,
      title: 'feat: action test',
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr],
    });

    // First assign to a role
    const assignPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/assign`;
    await fetchJson('POST', assignPath, port, { role: 'reviewer' });

    // Then execute action
    const actionPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/action`;
    const { status, data } = await fetchJson('POST', actionPath, port, {
      questionId: 'q1',
      choice: 'approve',
    });

    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data, { ok: true });

    // Verify MR moved to done lane
    const board = provider.getBoard();
    const reviewerRole = board.roles.find((r) => r.name === 'reviewer');
    assert.ok(reviewerRole);
    assert.strictEqual(reviewerRole.lanes.done.length, 1);
    assert.strictEqual(reviewerRole.lanes.done[0].webUrl, mr.webUrl);
  });

  it('returns 404 for unknown MR', async () => {
    const { status, data } = await fetchJson(
      'POST',
      `/api/mr/${encodeURIComponent('https://unknown.example.com/mr/999')}/action`,
      port,
      { questionId: 'q1', choice: 'approve' }
    );

    assert.strictEqual(status, 404);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, {
      code: 'not_found',
      message: 'MR not found: https://unknown.example.com/mr/999',
      anchor: 'mr',
    });
  });

  it('returns 400 for missing required fields', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/201',
      iid: 201,
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr],
    });

    const actionPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/action`;
    const { status, data } = await fetchJson('POST', actionPath, port, {});

    assert.strictEqual(status, 400);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, {
      code: 'invalid_input',
      message: 'Missing required fields: questionId, choice',
    });
  });

  it('returns 400 for an unknown choice value', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/202',
      iid: 202,
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr],
    });

    const actionPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/action`;
    const { status, data } = await fetchJson('POST', actionPath, port, {
      questionId: 'q1',
      choice: 'reject',
    });

    assert.strictEqual(status, 400);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, {
      code: 'invalid_input',
      message: 'Invalid choice: reject (expected one of post, approve, redispatch, skip)',
      anchor: 'choice',
    });
  });

  for (const choice of ['post', 'approve', 'redispatch', 'skip'] as const) {
    it(`accepts choice:'${choice}' and returns { ok: true }`, async () => {
      const mr = mockActionableMr({
        webUrl: `https://gitlab.example.com/group/project/-/merge_requests/${210 + ['post', 'approve', 'redispatch', 'skip'].indexOf(choice)}`,
        iid: 210,
      });

      provider.seed({
        roles: [{ name: 'reviewer', active: true }],
        unassigned: [mr],
      });

      const actionPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/action`;
      const { status, data } = await fetchJson('POST', actionPath, port, {
        questionId: 'q1',
        choice,
        payload: choice === 'redispatch' ? { focus: 'security' } : undefined,
      });

      assert.strictEqual(status, 200);
      assert.deepStrictEqual(data, { ok: true });
    });
  }
});

describe('MrRouter — GET /api/mr/:id/report', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    await server.stop();
  });

  it('returns MrDetail with findings and verdict', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/300',
      iid: 300,
      title: 'feat: report test',
    });

    provider.seed(
      {
        roles: [{ name: 'reviewer', active: true }],
        unassigned: [mr],
      },
      {
        [mr.webUrl]: {
          findings: [
            { severity: 'warning', file: 'src/index.ts', line: 10, message: 'Missing guard' },
          ],
          verdict: 'request_changes',
        },
      }
    );

    const reportPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/report`;
    const { status, data } = await fetchJson('GET', reportPath, port);

    assert.strictEqual(status, 200);

    const body = data as Record<string, unknown>;
    assert.strictEqual(body.ok, true);

    const detail = body as unknown as MrDetail;
    assert.strictEqual(detail.mr.webUrl, mr.webUrl);
    assert.strictEqual(detail.verdict, 'request_changes');
    assert.strictEqual(detail.findings.length, 1);
    assert.strictEqual(detail.findings[0].severity, 'warning');
    assert.ok(Array.isArray(detail.audit));
  });

  it('returns 404 for unknown MR', async () => {
    const { status, data } = await fetchJson(
      'GET',
      `/api/mr/${encodeURIComponent('https://unknown.example.com/mr/999')}/report`,
      port
    );

    assert.strictEqual(status, 404);
    const body = data as Record<string, unknown>;
    assert.deepStrictEqual(body.error, {
      code: 'not_found',
      message: 'MR not found: https://unknown.example.com/mr/999',
      anchor: 'mr',
    });
  });
});

describe('MrRouter — GET /api/mr/:id/audit', () => {
  let server: HttpServer;
  let provider: BoardProviderMock;
  let port: number;

  before(async () => {
    provider = new BoardProviderMock();
    server = new HttpServer({ port: 0, boardProvider: provider });
    await server.start();
    port = server.listeningPort() ?? assert.fail('Expected kernel-assigned port');
  });

  after(async () => {
    await server.stop();
  });

  it('returns audit events for an MR', async () => {
    const mr = mockActionableMr({
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/400',
      iid: 400,
    });

    provider.seed({
      roles: [{ name: 'reviewer', active: true }],
      unassigned: [mr],
    });

    const auditPath = `/api/mr/${encodeURIComponent(mr.webUrl)}/audit`;
    const { status, data } = await fetchJson('GET', auditPath, port);

    assert.strictEqual(status, 200);

    const body = data as Record<string, unknown>;
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.events));
    assert.ok((body.events as Array<unknown>).length > 0);
  });
});

// RoleRouter retired per D-API-02 (TSK-179 P1); route POST /api/role/:name/activate removed.
