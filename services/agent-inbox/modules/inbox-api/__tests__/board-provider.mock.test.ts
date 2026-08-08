// @file: Unit + integration tests for BoardProviderMock#recordFixTaskCopy and
//   POST /api/mr/:id/copy-fix-task — first click, repeat-click delta, delta baseline
//   against the LAST snapshot (not the first), one-event-per-call, 404 (SV-14, TSK-145).
// @consumers: node:test runner
// @tasks: TSK-145

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { HttpServer } from '../http-server.ts';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { MrDetail } from '../types.ts';

/** @purpose One finding fixture shape reused across cases, keyed by a short label for readability. */
type FindingFixture = MrDetail['findings'][number];

const FINDING_F1: FindingFixture = {
  severity: 'warning',
  file: 'src/a.ts',
  line: 10,
  message: 'Missing null check',
};
const FINDING_F2: FindingFixture = {
  severity: 'warning',
  file: 'src/b.ts',
  line: 20,
  message: 'Unused import',
};
const FINDING_F3: FindingFixture = {
  severity: 'error',
  file: 'src/c.ts',
  line: 30,
  message: 'Type mismatch',
};

/**
 * @purpose Test-local subclass exposing a findings-mutation seam over `BoardProviderMock`'s
 *   `protected _mrs` map — legitimate subclass access (the field is `protected`, not `private`),
 *   needed because `seed()` has no update path and would wipe prior `copied_fix_task` audit
 *   history if re-invoked between clicks (per AX_CONTRACT_OVER_IMPLEMENTATION: no `as unknown as`
 *   cast into the base class's internals).
 * @consumer This test file only.
 */
class TestableBoardProviderMock extends BoardProviderMock {
  /**
   * @purpose Replace the seeded findings for one MR, simulating new commits landing between
   *   two "Copy fix task" clicks on the same MR.
   * @param mrId MR identifier (webUrl).
   * @param findings New findings set to report on the next `recordFixTaskCopy`/`getReport` call.
   */
  setFindings(mrId: string, findings: FindingFixture[]): void {
    const state = this._mrs.get(mrId);
    if (state) state.findings = findings;
  }
}

/**
 * @purpose Seed a single mock MR with the given findings and return its webUrl for lookups.
 * @param provider Target BoardProviderMock instance.
 * @param findings Findings to seed into the MR's report.
 * @returns The seeded MR's webUrl.
 */
function seedMrWithFindings(provider: BoardProviderMock, findings: FindingFixture[]): string {
  const mr = mockActionableMr({
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/500',
    iid: 500,
  });
  provider.seed(
    { roles: [{ name: 'reviewer', active: true }], unassigned: [mr] },
    { [mr.webUrl]: { findings, verdict: 'request_changes' } }
  );
  return mr.webUrl;
}

describe('BoardProviderMock#recordFixTaskCopy', () => {
  it('records first fix-task copy with isFirst true and null delta', async () => {
    const provider = new BoardProviderMock();
    const mrId = seedMrWithFindings(provider, [FINDING_F1]);

    const result = await provider.recordFixTaskCopy(mrId);

    assert.deepStrictEqual(result, {
      isFirst: true,
      priorCopyCount: 0,
      lastCopiedAt: null,
      delta: null,
    });
    assert.strictEqual(
      provider.getAudit(mrId).filter((entry) => entry.event === 'copied_fix_task').length,
      1
    );
  });

  it('computes delta against last snapshot on repeat copy', async () => {
    const provider = new TestableBoardProviderMock();
    const mrId = seedMrWithFindings(provider, [FINDING_F1]);

    await provider.recordFixTaskCopy(mrId);
    // #region START_REPEAT_COPY_TRIGGER_SECOND_CLICK — findings grew from [f1] to [f1, f2] between clicks
    provider.setFindings(mrId, [FINDING_F1, FINDING_F2]);
    const result = await provider.recordFixTaskCopy(mrId);
    // #endregion END_REPEAT_COPY_TRIGGER_SECOND_CLICK

    assert.strictEqual(result?.isFirst, false);
    assert.deepStrictEqual(
      result?.delta?.added.map((s) => s.file),
      ['src/b.ts']
    );
    assert.deepStrictEqual(
      result?.delta?.unchanged.map((s) => s.file),
      ['src/a.ts']
    );
    assert.deepStrictEqual(result?.delta?.resolved, []);
  });

  it('third copy diffs against second snapshot not first', async () => {
    const provider = new TestableBoardProviderMock();
    const mrId = seedMrWithFindings(provider, [FINDING_F1]);

    await provider.recordFixTaskCopy(mrId); // 1st snapshot: [f1]
    provider.setFindings(mrId, [FINDING_F1, FINDING_F2]);
    await provider.recordFixTaskCopy(mrId); // 2nd snapshot: [f1, f2]
    provider.setFindings(mrId, [FINDING_F2, FINDING_F3]);
    const result = await provider.recordFixTaskCopy(mrId); // 3rd call: diffs vs 2nd, not 1st

    assert.deepStrictEqual(
      result?.delta?.added.map((s) => s.file),
      ['src/c.ts']
    );
    assert.deepStrictEqual(
      result?.delta?.resolved.map((s) => s.file),
      ['src/a.ts']
    );
    assert.deepStrictEqual(
      result?.delta?.unchanged.map((s) => s.file),
      ['src/b.ts']
    );
  });

  it('each call appends exactly one copied_fix_task audit event', async () => {
    const provider = new BoardProviderMock();
    const mrId = seedMrWithFindings(provider, [FINDING_F1]);

    for (let i = 0; i < 3; i++) {
      await provider.recordFixTaskCopy(mrId);
    }

    assert.strictEqual(
      provider.getAudit(mrId).filter((entry) => entry.event === 'copied_fix_task').length,
      3
    );
  });
});

/** @purpose Helper to make an HTTP request and collect the response — mirrors mr.router.test.ts. */
function fetchJson(
  method: string,
  path: string,
  port: number
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: 'localhost', port, path, method }, (res) => {
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
    });
    req.on('error', reject);
    req.end();
  });
}

describe('MrRouter — POST /api/mr/:id/copy-fix-task', () => {
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

  it('returns FixTaskCopyResult with isFirst true on first click', async () => {
    const mrId = seedMrWithFindings(provider, [FINDING_F1]);

    const { status, data } = await fetchJson(
      'POST',
      `/api/mr/${encodeURIComponent(mrId)}/copy-fix-task`,
      port
    );

    assert.strictEqual(status, 200);
    const body = data as Record<string, unknown>;
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.isFirst, true);
    assert.strictEqual(body.delta, null);
  });

  it('returns the canonical not_found envelope for an unknown MR', async () => {
    const { status, data } = await fetchJson(
      'POST',
      `/api/mr/${encodeURIComponent('https://unknown.example.com/mr/999')}/copy-fix-task`,
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
