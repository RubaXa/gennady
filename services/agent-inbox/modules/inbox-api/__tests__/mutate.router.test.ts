// @file: Integration tests for MutateRouter — revision-CAS apply (D-99), broadcast fan-out of
//   mutation+refresh on success, and byte-unchanged review.json + refresh-to-all on conflict.
// @consumers: node:test runner
// @tasks: TSK-129

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { SessionPool } from '../../inbox-opencode/session-pool.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import type { MutationProposal } from '../../inbox-chat/types.ts';

/** @purpose Helper to POST a JSON body and collect the response. */
function postJson(
  path: string,
  port: number,
  body: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    req.write(JSON.stringify(body));
    req.end();
  });
}

/** @purpose One connected SSE test client — reads server-pushed chunks in arrival order. */
type SseTestClient = {
  waitForNext(): Promise<string>;
  destroy(): void;
};

/** @purpose Open a raw SSE connection against `/chat/stream` and expose ordered chunk reads. */
function connectSseClient(port: number, mrRef: string): Promise<SseTestClient> {
  return new Promise((resolveClient, rejectClient) => {
    const buffered: string[] = [];
    const pending: Array<(chunk: string) => void> = [];

    const req = request(
      { hostname: 'localhost', port, path: `/api/mr/${encodeURIComponent(mrRef)}/chat/stream` },
      (res) => {
        res.on('data', (buf: Buffer) => {
          const text = buf.toString('utf-8');
          const resolvePending = pending.shift();
          if (resolvePending) resolvePending(text);
          else buffered.push(text);
        });
        resolveClient({
          waitForNext: () =>
            buffered.length > 0
              ? Promise.resolve(buffered.shift() as string)
              : new Promise<string>((r) => pending.push(r)),
          destroy: () => req.destroy(),
        });
      }
    );
    req.on('error', rejectClient);
    req.end();
  });
}

// ── unified context ──

type MutateRouterContext = {
  stateDir: string;
  server: HttpServer;
  port: number;
};

/** @purpose One lifecycle context per case: a real HttpServer with the chat bridge wired over a real (temp) StateStore — opencode is a mock only because it's genuinely external and unused by /mutate. */
async function createMutateRouterContext(port: number): Promise<MutateRouterContext> {
  const stateDir = makeTestTmpDir('mutate-router-');
  const store = new StateStore(stateDir);
  const pool = new SessionPool({ maxSessions: 5, opencode: new OpenCodeMock() });
  const server = new HttpServer({
    port,
    boardProvider: new BoardProviderMock(),
    chat: { pool, store },
  });
  await server.start();
  return { stateDir, server, port };
}

async function destroyMutateRouterContext(ctx: MutateRouterContext): Promise<void> {
  await ctx.server.stop();
  cleanupTestTmp(ctx.stateDir);
}

/** @purpose Seed `review.json` on disk with one finding at a given revision, matching MutationApplier's on-disk shape. */
async function seedReviewDocument(
  stateDir: string,
  mrRef: string,
  revision: number
): Promise<string> {
  const dir = mrReportsDir(stateDir, mrRef);
  await mkdir(dir, { recursive: true });
  const filePath = `${dir}/review.json`;
  const document = {
    verdict: 'changes_requested',
    findings: [{ id: 'C-1', severity: 'major', file: 'a.ts', line: 1, message: 'fix me' }],
    revision,
  };
  await writeFile(filePath, JSON.stringify(document, null, 2), 'utf-8');
  return filePath;
}

describe('MutateRouter — POST /mutate', () => {
  let ctx: MutateRouterContext;
  const PORT = 4210;

  beforeEach(async () => {
    ctx = await createMutateRouterContext(PORT);
  });

  afterEach(async () => {
    await destroyMutateRouterContext(ctx);
  });

  it('Успешный mutate — broadcast mutation+refresh', async () => {
    const mrRef = 'group/proj!20';
    await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const streamClient = await connectSseClient(PORT, mrRef);
    await streamClient.waitForNext(); // initial `retry:` hint

    const { status, data } = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/mutate`, PORT, {
      proposal,
      revision: 0,
    });

    assert.strictEqual(status, 200);
    const body = data as { ok: boolean; snapshot: string; revision: number };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.revision, 1);
    assert.ok(body.snapshot.length > 0);

    // #region START_ASSERT_BROADCAST_ORDER — invariant: mutation frame precedes refresh, both reach the subscriber (D-100)
    const mutationFrame = await streamClient.waitForNext();
    const refreshFrame = await streamClient.waitForNext();
    assert.match(mutationFrame, /^event: mutation\n/);
    assert.match(refreshFrame, /^event: refresh\n/);
    // #endregion END_ASSERT_BROADCAST_ORDER

    streamClient.destroy();
  });

  it('CAS-конфликт на mutate — 409 + refresh всем', async () => {
    const mrRef = 'group/proj!21';
    const reviewPath = await seedReviewDocument(ctx.stateDir, mrRef, 0);
    const beforeBytes = await readFile(reviewPath, 'utf-8');
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'C-1',
      before: 'major',
      after: 'minor',
    };

    const streamClient = await connectSseClient(PORT, mrRef);
    await streamClient.waitForNext(); // initial `retry:` hint

    const { status, data } = await postJson(`/api/mr/${encodeURIComponent(mrRef)}/mutate`, PORT, {
      proposal,
      revision: 5, // stale — on-disk revision is 0
    });

    assert.strictEqual(status, 409);
    assert.deepStrictEqual(data, {
      ok: false,
      error: 'STALE_REVISION',
      detail: 'review.json revision 0 no longer matches 5',
    });

    const afterBytes = await readFile(reviewPath, 'utf-8');
    assert.strictEqual(afterBytes, beforeBytes);

    const refreshFrame = await streamClient.waitForNext();
    assert.match(refreshFrame, /^event: refresh\n/);

    streamClient.destroy();
  });
});
